"""Two-way sync between the tribe's yearly schedule (an .xlsx in Google Drive) and the site.

Runs on GitHub Actions every few minutes:
  1. Downloads the Excel file from Drive.
  2. Applies the changes people made in the site (Firestore collection "cal_ops") straight into the
     sheet XML, touching only the cells involved, so the rest of the file stays exactly as it was.
  3. Uploads the file back, but only if nobody changed it in Drive in the meantime.
  4. Reads every event out of the file and stores them in Firestore (cal/all) for the site.

Local test:  python3 scripts/calsync.py --file luz.xlsx [--ops ops.json] [--out new.xlsx] [--dump events.json]
"""
import io
import json
import os
import re
import sys
import time
import zipfile
import datetime as dt
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

FILE_ID = os.environ.get("CAL_FILE_ID", "1d-pKtSX33Yp7kf3tzFxN5zddt3oRVbrJ")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
MONTHS = {"ינואר": 1, "פברואר": 2, "מרץ": 3, "אפריל": 4, "מאי": 5, "יוני": 6, "יולי": 7,
          "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12}
DATE_FILL = "FFD8D8D8"
GRID_COLS = 7  # A..G = Sunday..Saturday
TIME_RE = re.compile(r"(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?")


# ---------- small helpers ----------
def col_num(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def col_letters(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)$", ref)
    return col_num(m.group(1)), int(m.group(2))


def ref_of(col, row):
    return col_letters(col) + str(row)


def text_of(el):
    """All text of a shared string / inline string (rich text runs included)."""
    return "".join(t.text or "" for t in el.iter("{%s}t" % NS["m"]))


def norm_color(rgb):
    rgb = (rgb or "").upper()
    if len(rgb) == 6:
        rgb = "FF" + rgb
    return rgb


# ---------- workbook model ----------
class Book:
    def __init__(self, data):
        self.zip_bytes = data
        z = zipfile.ZipFile(io.BytesIO(data))
        self.files = {i.filename: z.read(i.filename) for i in z.infolist()}
        self.order = [i.filename for i in z.infolist()]
        self.changed = set()
        self._strings()
        self._styles()
        self._sheets()

    def _strings(self):
        self.sst = []
        raw = self.files.get("xl/sharedStrings.xml")
        if raw:
            for si in ET.fromstring(raw).findall("m:si", NS):
                self.sst.append(text_of(si))

    def _styles(self):
        st = ET.fromstring(self.files["xl/styles.xml"])
        fills = []
        for f in st.find("m:fills", NS).findall("m:fill", NS):
            pf = f.find("m:patternFill", NS)
            color = None
            if pf is not None and pf.get("patternType") not in (None, "none"):
                fg = pf.find("m:fgColor", NS)
                if fg is not None and fg.get("rgb"):
                    color = norm_color(fg.get("rgb"))
            fills.append(color)
        self.xf_fill = []
        for xf in st.find("m:cellXfs", NS).findall("m:xf", NS):
            self.xf_fill.append(fills[int(xf.get("fillId", 0))])

    def fill_of(self, s):
        try:
            return self.xf_fill[int(s)]
        except (TypeError, ValueError, IndexError):
            return None

    def _sheets(self):
        wb = ET.fromstring(self.files["xl/workbook.xml"])
        rels = ET.fromstring(self.files["xl/_rels/workbook.xml.rels"])
        target = {r.get("Id"): r.get("Target") for r in rels}
        self.sheets = []
        for sh in wb.find("m:sheets", NS).findall("m:sheet", NS):
            t = target[sh.get(RNS)].lstrip("/")
            path = t if t.startswith("xl/") else "xl/" + t
            self.sheets.append({"name": sh.get("name"), "path": path})

    def save(self):
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for name in self.order:
                z.writestr(name, self.files[name])
        return out.getvalue()


class Sheet:
    """Cells of one month sheet, plus the calendar layout found in it."""

    def __init__(self, book, info):
        self.book, self.name, self.path = book, info["name"], info["path"]
        self.xml = book.files[self.path].decode("utf-8")
        self.read()

    def read(self):
        root = ET.fromstring(self.xml.encode("utf-8"))
        self.cells = {}  # (col,row) -> {"s":, "v": text or number}
        for c in root.iter("{%s}c" % NS["m"]):
            col, row = split_ref(c.get("r"))
            t, s = c.get("t"), c.get("s")
            v = c.find("m:v", NS)
            val = None
            if t == "s" and v is not None:
                val = self.book.sst[int(v.text)]
            elif t == "inlineStr":
                is_ = c.find("m:is", NS)
                val = text_of(is_) if is_ is not None else None
            elif t == "str" and v is not None:
                val = v.text
            elif v is not None and v.text is not None:
                try:
                    val = float(v.text)
                except ValueError:
                    val = v.text
            self.cells[(col, row)] = {"s": s, "v": val}
        self.merges = []
        mc = root.find("m:mergeCells", NS)
        if mc is not None:
            for m in mc.findall("m:mergeCell", NS):
                a, b = m.get("ref").split(":")
                (c0, r0), (c1, r1) = split_ref(a), split_ref(b)
                self.merges.append((c0, r0, c1, r1))
        self.layout()

    def value(self, col, row):
        c = self.cells.get((col, row))
        return None if c is None else c["v"]

    def fill(self, col, row):
        c = self.cells.get((col, row))
        return None if c is None else self.book.fill_of(c["s"])

    def layout(self):
        title = str(self.value(1, 1) or "")
        m = re.search(r"(\S+)\s+(\d{4})", title)
        self.month = MONTHS.get(m.group(1)) if m else None
        self.year = int(m.group(2)) if m else None
        rows = sorted({r for (_, r) in self.cells})
        self.weeks = []  # [{"row": date row, "days": {col: date}}]
        for r in rows:
            days = {}
            for c in range(1, GRID_COLS + 1):
                v = self.value(c, r)
                if isinstance(v, float) and self.fill(c, r) == DATE_FILL and self.month:
                    day = int(v + 1e-9)
                    try:
                        days[c] = dt.date(self.year, self.month, day)
                    except ValueError:
                        pass
            if len(days) >= 1 and all(self.fill(c, r) == DATE_FILL for c in days):
                self.weeks.append({"row": r, "days": days})
        # Each week's event rows run until the next date row (the last week: up to 12 rows).
        for i, w in enumerate(self.weeks):
            nxt = self.weeks[i + 1]["row"] if i + 1 < len(self.weeks) else w["row"] + 13
            w["rows"] = list(range(w["row"] + 1, nxt))
        if self.weeks:
            last = self.weeks[-1]
            used = [r for r in last["rows"] if any(self.value(c, r) not in (None, "") for c in range(1, GRID_COLS + 1))]
            last["rows"] = list(range(last["row"] + 1, (max(used) if used else last["row"]) + 2))

    def merge_at(self, col, row):
        for (c0, r0, c1, r1) in self.merges:
            if c0 <= col <= c1 and r0 <= row <= r1:
                return (c0, r0, c1, r1)
        return None

    def legend(self):
        out = {}
        for (c, r), cell in self.cells.items():
            if c <= GRID_COLS + 0 or not isinstance(cell["v"], str):
                continue
            f = self.book.fill_of(cell["s"])
            name = cell["v"].strip()
            if f and name and f not in out and len(name) < 40:
                out[f] = name
        return out

    def events(self, legend):
        out = []
        for w in self.weeks:
            for r in w["rows"]:
                for c in range(1, GRID_COLS + 1):
                    v = self.value(c, r)
                    if v is None or (isinstance(v, str) and not v.strip()):
                        continue
                    mg = self.merge_at(c, r)
                    if mg and (mg[0] != c or mg[1] != r):
                        continue
                    c1 = mg[2] if mg else c
                    dates = [w["days"][k] for k in range(c, c1 + 1) if k in w["days"]]
                    if not dates:
                        continue
                    text = str(v if not isinstance(v, float) else (int(v) if v.is_integer() else v)).strip()
                    color = self.fill(c, r)
                    ev = parse_text(text)
                    ev.update({
                        "id": self.name + "!" + ref_of(c, r),
                        "sheet": self.name, "ref": ref_of(c, r), "raw": text,
                        "date": dates[0].isoformat(), "end": dates[-1].isoformat(),
                        "color": color[2:] if color else "", "cat": legend.get(color, "") if color else "",
                    })
                    ev["act"] = color == "FFFFE598" or ev["title"].strip().startswith("פעול")
                    out.append(ev)
        return out

    # ---------- writing ----------
    def _cell_re(self, ref):
        return re.compile(r'<c r="%s"(?: [^>]*?)?(?:/>|>.*?</c>)' % ref, re.S)

    def set_cell(self, col, row, text, style):
        ref = ref_of(col, row)
        if text is None or text == "":
            new = '<c r="%s"%s/>' % (ref, ' s="%s"' % style if style is not None else "")
        else:
            new = '<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (
                ref, ' s="%s"' % style if style is not None else "", escape(text))
        rx = self._cell_re(ref)
        if rx.search(self.xml):
            self.xml = rx.sub(lambda m: new, self.xml, count=1)
        else:
            self._insert_cell(col, row, new)
        self.book.changed.add(self.path)

    def _insert_cell(self, col, row, new):
        row_rx = re.compile(r'<row r="%d"(?: [^>]*?)?(?:/>|>(.*?)</row>)' % row, re.S)
        m = row_rx.search(self.xml)
        if not m:
            # Create the row in order.
            nxt = None
            for mm in re.finditer(r'<row r="(\d+)"', self.xml):
                if int(mm.group(1)) > row:
                    nxt = mm.start()
                    break
            piece = '<row r="%d">%s</row>' % (row, new)
            if nxt is None:
                i = self.xml.index("</sheetData>")
                self.xml = self.xml[:i] + piece + self.xml[i:]
            else:
                self.xml = self.xml[:nxt] + piece + self.xml[nxt:]
            return
        whole = m.group(0)
        if whole.endswith("/>"):
            open_tag = whole[:-2] + ">"
            body = ""
        else:
            open_tag = whole[: whole.index(">") + 1]
            body = m.group(1) or ""
        cells = list(re.finditer(r'<c r="([A-Z]+)\d+"(?: [^>]*?)?(?:/>|>.*?</c>)', body, re.S))
        pos = len(body)
        for cm in cells:
            if col_num(cm.group(1)) > col:
                pos = cm.start()
                break
        body = body[:pos] + new + body[pos:]
        self.xml = self.xml[: m.start()] + open_tag + body + "</row>" + self.xml[m.end():]

    def add_merge(self, c0, r, c1):
        if c1 <= c0:
            return
        ref = "%s:%s" % (ref_of(c0, r), ref_of(c1, r))
        if "<mergeCells" in self.xml:
            self.xml = re.sub(r"</mergeCells>", '<mergeCell ref="%s"/></mergeCells>' % ref, self.xml, count=1)
        else:
            i = self.xml.index("</sheetData>") + len("</sheetData>")
            self.xml = self.xml[:i] + '<mergeCells count="0"><mergeCell ref="%s"/></mergeCells>' % ref + self.xml[i:]
        self._recount()
        self.merges.append((c0, r, c1, r))
        self.book.changed.add(self.path)

    def remove_merge(self, mg):
        c0, r0, c1, r1 = mg
        ref = "%s:%s" % (ref_of(c0, r0), ref_of(c1, r1))
        self.xml = self.xml.replace('<mergeCell ref="%s"/>' % ref, "", 1)
        self._recount()
        self.merges = [m for m in self.merges if m != mg]
        self.book.changed.add(self.path)

    def _recount(self):
        n = len(re.findall(r"<mergeCell ", self.xml))
        self.xml = re.sub(r'<mergeCells count="\d+"', '<mergeCells count="%d"' % n, self.xml, count=1)

    def insert_row_after(self, row):
        """Push every row below `row` down by one so a new empty row appears at row+1."""
        def shift_ref(m):
            col, r = m.group(1), int(m.group(2))
            return "%s%d" % (col, r + 1 if r > row else r)

        def shift_row(m):
            r = int(m.group(1))
            return '<row r="%d"' % (r + 1 if r > row else r)

        head, rest = self.xml.split("<sheetData>", 1) if "<sheetData>" in self.xml else self.xml.split("<sheetData/>", 1)
        data, tail = rest.split("</sheetData>", 1)
        data = re.sub(r'<row r="(\d+)"', shift_row, data)
        data = re.sub(r'(?<=<c r=")([A-Z]+)(\d+)', shift_ref, data)
        tail = re.sub(r'(?<=ref=")([A-Z]+)(\d+)', shift_ref, tail)
        tail = re.sub(r'(?<=:)([A-Z]+)(\d+)(?=")', shift_ref, tail)
        tail = re.sub(r'(?<=sqref=")([A-Z]+)(\d+)', shift_ref, tail)
        # Copy the look of the row above (borders, background) for the new row.
        prev = re.search(r'<row r="%d"(?: [^>]*?)?(?:/>|>(.*?)</row>)' % row, data, re.S)
        cells = ""
        blank = blank_style(self, row)
        if prev and prev.group(1):
            for cm in re.finditer(r'<c r="([A-Z]+)\d+"(?: [^>]*?s="(\d+)")?', prev.group(1)):
                st = cm.group(2)
                if col_num(cm.group(1)) <= GRID_COLS and (self.book.fill_of(st) or self.value(col_num(cm.group(1)), row) not in (None, "")):
                    st = blank
                cells += '<c r="%s%d"%s/>' % (cm.group(1), row + 1, ' s="%s"' % st if st else "")
        new_row = '<row r="%d">%s</row>' % (row + 1, cells)
        nxt = re.search(r'<row r="%d"' % (row + 2), data)
        if nxt:
            data = data[: nxt.start()] + new_row + data[nxt.start():]
        else:
            data += new_row
        self.xml = head + "<sheetData>" + data + "</sheetData>" + tail
        self.book.changed.add(self.path)
        self.read()

    def commit(self):
        self.book.files[self.path] = self.xml.encode("utf-8")


def parse_text(text):
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    time_s = time_e = ""
    keep = []
    for l in lines:
        m = TIME_RE.search(l)
        if m and not time_s and len(TIME_RE.sub("", l).strip(" -–")) == 0:
            time_s, time_e = m.group(1), m.group(2) or ""
            continue
        if m and not time_s and (l.startswith(m.group(0)) or l.endswith(m.group(0))):
            time_s, time_e = m.group(1), m.group(2) or ""
            l = l.replace(m.group(0), "").strip(" -–,")
        keep.append(l)
    return {"title": " ".join(keep).strip() or text.strip(), "time": time_s, "timeEnd": time_e}


def compose_text(title, time_s, time_e):
    t = (title or "").strip()
    if time_s:
        t += "\n" + time_s + ("-" + time_e if time_e else "")
    return t


# ---------- reading the whole book ----------
def load(book):
    sheets = [Sheet(book, info) for info in book.sheets]
    legend = {}
    for sh in sheets:
        for k, v in sh.legend().items():
            if k not in legend and v not in legend.values():
                legend[k] = v
    # The yellow of regular activities is not in the sheet's colour key; it counts as "שגרה".
    legend["FFFFE598"] = "שגרה"
    return sheets, legend


def all_events(sheets, legend):
    evs = []
    for sh in sheets:
        if sh.month:
            evs.extend(sh.events(legend))
    evs.sort(key=lambda e: (e["date"], e["time"] or "99", e["ref"]))
    return evs


def style_for(sheets, sheet, color):
    """A cell style index that already has this background, preferring an event cell in the grid."""
    color = norm_color(color)
    for sh in [sheet] + [s for s in sheets if s is not sheet]:
        for w in sh.weeks:
            for r in w["rows"]:
                for c in range(1, GRID_COLS + 1):
                    cell = sh.cells.get((c, r))
                    if cell and cell["v"] not in (None, "") and sh.book.fill_of(cell["s"]) == color:
                        return cell["s"]
    for sh in [sheet] + sheets:
        for (c, r), cell in sh.cells.items():
            if sh.book.fill_of(cell["s"]) == color:
                return cell["s"]
    return None


def blank_style(sheet, row):
    """Style of an empty grid cell near this row (keeps the borders without a colour)."""
    for r in [row] + [row + d for d in (1, -1, 2, -2, 3, -3)]:
        for c in range(1, GRID_COLS + 1):
            cell = sheet.cells.get((c, r))
            if cell and cell["v"] in (None, "") and not sheet.book.fill_of(cell["s"]) and not sheet.merge_at(c, r):
                return cell["s"]
    return None


def find_sheet(sheets, date):
    for sh in sheets:
        if sh.year == date.year and sh.month == date.month:
            return sh
    return None


def place_event(sheets, legend_rev, op):
    """Add one event. Multi-day events become one merged bar per week."""
    start = dt.date.fromisoformat(op["date"])
    end = dt.date.fromisoformat(op.get("end") or op["date"])
    if end < start:
        end = start
    text = compose_text(op.get("title"), op.get("time"), op.get("timeEnd"))
    color = op.get("color") or legend_rev.get(op.get("cat") or "", "")
    refs = []
    d = start
    while d <= end:
        sh = find_sheet(sheets, d)
        if not sh:
            raise ValueError("אין גיליון לחודש של %s" % d.isoformat())
        wk = next((w for w in sh.weeks if d in w["days"].values()), None)
        if not wk:
            raise ValueError("לא נמצא השבוע של %s" % d.isoformat())
        cols = sorted(c for c, x in wk["days"].items() if d <= x <= end)
        c0, c1 = cols[0], cols[-1]
        last_day = wk["days"][c1]
        row = None
        for r in wk["rows"]:
            if all(sh.value(c, r) in (None, "") and not sh.merge_at(c, r) for c in range(c0, c1 + 1)):
                row = r
                break
        if row is None:
            sh.insert_row_after(wk["rows"][-1])
            wk = next(w for w in sh.weeks if w["row"] == wk["row"])
            row = wk["rows"][-1]
        style = style_for(sheets, sh, color) if color else blank_style(sh, row)
        sh.set_cell(c0, row, text, style)
        for c in range(c0 + 1, c1 + 1):
            sh.set_cell(c, row, "", style)
        sh.add_merge(c0, row, c1)
        sh.commit()
        sh.read()
        refs.append(sh.name + "!" + ref_of(c0, row))
        d = last_day + dt.timedelta(days=1)
        # Skip over days that belong to the next sheet's first row, handled by the loop.
    return refs


def locate(sheets, op):
    sh = next((s for s in sheets if s.name == op["sheet"]), None)
    if not sh:
        raise LookupError("הגיליון לא נמצא")
    col, row = split_ref(op["ref"])
    cur = sh.value(col, row)
    cur = "" if cur is None else str(cur).strip()
    if op.get("raw") is not None and cur != str(op["raw"]).strip():
        raise LookupError("האירוע השתנה באקסל בינתיים")
    return sh, col, row


def remove_event(sheets, op):
    sh, col, row = locate(sheets, op)
    mg = sh.merge_at(col, row)
    blank = blank_style(sh, row)
    c1 = mg[2] if mg else col
    if mg:
        sh.remove_merge(mg)
    for c in range(col, c1 + 1):
        sh.set_cell(c, row, "", blank)
    sh.commit()
    sh.read()


def edit_event(sheets, legend_rev, op):
    sh, col, row = locate(sheets, op)
    text = compose_text(op.get("title"), op.get("time"), op.get("timeEnd"))
    color = op.get("color") or legend_rev.get(op.get("cat") or "", "")
    cell = sh.cells.get((col, row)) or {}
    style = style_for(sheets, sh, color) if color else cell.get("s")
    if style is None:
        style = cell.get("s")
    mg = sh.merge_at(col, row)
    sh.set_cell(col, row, text, style)
    if mg:
        for c in range(mg[0] + 1, mg[2] + 1):
            sh.set_cell(c, row, "", style)
    sh.commit()
    sh.read()


def apply_ops(book, ops):
    """ops: list of dicts with "id" and "kind" (add/edit/delete/move). Returns {op id: result}."""
    sheets, legend = load(book)
    legend_rev = {v: k for k, v in legend.items()}
    results = {}
    # Edits and deletes first: they point at cells by address, and adding can push rows down.
    order = sorted(ops, key=lambda o: (0 if o["kind"] in ("edit", "delete", "move") else 1, o.get("at", 0)))
    for op in order:
        try:
            if op["kind"] == "delete":
                remove_event(sheets, op)
                results[op["id"]] = {"ok": True}
            elif op["kind"] == "edit":
                edit_event(sheets, legend_rev, op)
                results[op["id"]] = {"ok": True}
            elif op["kind"] == "move":
                remove_event(sheets, op)
                results[op["id"]] = {"ok": True, "pendingAdd": True}
                op["_readd"] = True
            elif op["kind"] == "add":
                results[op["id"]] = {"ok": True, "refs": place_event(sheets, legend_rev, op)}
        except Exception as e:  # keep going with the other changes
            results[op["id"]] = {"ok": False, "error": str(e)}
    for op in order:
        if op.get("_readd"):
            try:
                results[op["id"]] = {"ok": True, "refs": place_event(sheets, legend_rev, op)}
            except Exception as e:
                results[op["id"]] = {"ok": False, "error": "נמחק מהתאריך הישן אבל לא נוסף לחדש: " + str(e)}
    return results


# ---------- Drive + Firestore (GitHub Actions only) ----------
def drive_session(info):
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/drive"])
    return AuthorizedSession(creds)


def drive_meta(s):
    r = s.get("https://www.googleapis.com/drive/v3/files/%s" % FILE_ID,
              params={"fields": "id,name,modifiedTime,headRevisionId,md5Checksum", "supportsAllDrives": "true"})
    r.raise_for_status()
    return r.json()


def drive_download(s):
    r = s.get("https://www.googleapis.com/drive/v3/files/%s" % FILE_ID, params={"alt": "media", "supportsAllDrives": "true"})
    r.raise_for_status()
    return r.content


def drive_upload(s, data):
    r = s.patch("https://www.googleapis.com/upload/drive/v3/files/%s" % FILE_ID,
                params={"uploadType": "media", "supportsAllDrives": "true"}, data=data,
                headers={"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
    r.raise_for_status()
    return r.json()


ROLE_KEY = {"מדריך קורס": "course", "ראשג״ד": "rashgad", "ראש״צ": "rashatz", "מרכז צעיר": "young", "מרכז בוגר": "senior",
            "דרג מתנדב": "volunteer", "מלווה ט׳": "escort", "מדריך שכבה": "layer"}


def publish_people(db, firestore, users):
    """From the users: the public list of possible direct managers (for the registration page)
    and the org tree that the site uses to route equipment requests."""
    try:
        managers, tree = [], {}
        for uid, u in users.items():
            name = u.get("fullName") or u.get("name") or uid.split("@")[0]
            tree[uid] = {"n": name, "r": u.get("role", ""), "m": u.get("manager", ""), "mn": u.get("managerName", "") if not u.get("manager") else "", "u": u.get("unit", "")}
            if not u.get("paused") and u.get("role") in ("מרכז צעיר", "מרכז בוגר"):
                managers.append({"id": uid, "name": name, "role": u.get("role")})
        managers.sort(key=lambda x: (x["role"] != "מרכז בוגר", x["name"]))
        ref = db.collection("public").document("managers")
        cur = ref.get()
        if not cur.exists or (cur.to_dict() or {}).get("list") != managers:
            ref.set({"list": managers, "at": firestore.SERVER_TIMESTAMP})
        ref2 = db.collection("org").document("tree")
        cur2 = ref2.get()
        if not cur2.exists or (cur2.to_dict() or {}).get("map") != tree:
            ref2.set({"map": tree, "at": firestore.SERVER_TIMESTAMP})
    except Exception as e:
        print("Could not update the people lists:", e)


def send_push(db, tokens_by_user, emails, title, body, link):
    from firebase_admin import messaging
    owners = {}
    for e in emails:
        for t in tokens_by_user.get(e, []):
            owners[t] = e
    tokens = list(owners)
    if not tokens:
        return 0
    res = messaging.send_each_for_multicast(messaging.MulticastMessage(
        tokens=tokens,
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(title=title, body=body, icon="https://guydag.github.io/biconverter/icon-192.png?v=3", badge="https://guydag.github.io/biconverter/icon-192.png?v=3", direction="rtl", language="he"),
            fcm_options=messaging.WebpushFCMOptions(link=link))))
    for r, t in zip(res.responses, tokens):
        code = getattr(r.exception, "code", "") if r.exception else ""
        if r.exception and ("not-registered" in str(code).lower() or "unregistered" in str(code).lower() or "invalid" in str(code).lower()):
            from firebase_admin import firestore as fs
            db.collection("subs").document(owners[t]).set({"tokens": fs.ArrayRemove([t])}, merge=True)
    return res.success_count


class Sync:
    """One connection to Firestore and Drive, used for a single sync or for a watch."""

    def __init__(self, info):
        import firebase_admin
        from firebase_admin import credentials, firestore
        self.fs = firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(info))
        self.db = firestore.client()
        self.info = info
        self.s = drive_session(info)
        self.status = self.db.collection("cal").document("status")
        self.last_modified = None
        self.hidden = {}
        self.book = None
        self.written = {}

    def pending_ops(self):
        ops = []
        for d in self.db.collection("cal_ops").where("state", "==", "pending").stream():
            o = d.to_dict()
            o["id"] = d.id
            ops.append(o)
        return ops

    def store(self, book, modified):
        """Events for managers (cal/all) and one copy per role, without the categories that role may not see."""
        sheets, legend = load(book)
        evs = all_events(sheets, legend)
        cats, seen = [], set()
        for k, v in legend.items():
            if v not in seen:
                seen.add(v)
                cats.append({"name": v, "color": k[2:]})
        docs = {"all": (evs, cats)}
        roles = list(ROLE_KEY.items())
        hidden_all = set.intersection(*[set(self.hidden.get(r, [])) for r, _ in roles]) if roles else set()
        hidden_any = set().union(*[set(self.hidden.get(r, [])) for r, _ in roles]) if roles else set()
        for role, key in roles + [("", "none")]:
            hide = set(self.hidden.get(role, [])) if role else hidden_any
            docs["v_" + key] = ([e for e in evs if not e["cat"] or e["cat"] not in hide], [c for c in cats if c["name"] not in hide])
        for key, (ev, cs) in docs.items():
            payload = json.dumps(ev, ensure_ascii=False)
            sig = hash(payload + json.dumps(cs, ensure_ascii=False))
            if self.written.get(key) == sig:
                continue
            self.db.collection("cal").document(key).set({
                "events": payload, "cats": cs, "count": len(ev),
                "fileModified": modified, "at": self.fs.SERVER_TIMESTAMP,
            })
            self.written[key] = sig
        return len(evs)

    def once(self, ops=None, reload=True):
        """Apply waiting changes to the Excel, then store the events. Returns False if Drive can't be reached."""
        fs, db, s = self.fs, self.db, self.s
        try:
            meta = drive_meta(s)
        except Exception as e:
            msg = str(e)
            print("Drive error:", msg)
            self.status.set({"ok": False, "error": msg[:500], "serviceAccount": self.info.get("client_email"), "at": fs.SERVER_TIMESTAMP})
            return False
        if ops is None:
            ops = self.pending_ops()
        if reload or self.book is None or meta.get("modifiedTime") != self.last_modified:
            self.book = Book(drive_download(s))
        book = self.book
        if ops:
            results = apply_ops(book, ops)
            if book.changed:
                # Upload only if the file did not change in Drive since we read it.
                now = drive_meta(s)
                if now.get("headRevisionId") != meta.get("headRevisionId") or now.get("modifiedTime") != meta.get("modifiedTime"):
                    print("The file changed in Drive while syncing; trying again in a moment.")
                    self.book = None
                    return True
                new_bytes = book.save()
                drive_upload(s, new_bytes)
                book = self.book = Book(new_bytes)
                meta = drive_meta(s)
            for o in ops:
                r = results.get(o["id"], {"ok": False, "error": "לא טופל"})
                db.collection("cal_ops").document(o["id"]).set(
                    {"state": "done" if r.get("ok") else "failed", "error": r.get("error", ""), "doneAt": fs.SERVER_TIMESTAMP}, merge=True)
            print(time.strftime("%H:%M:%S"), "Applied", len(ops), "changes:", results)
        n = self.store(book, meta.get("modifiedTime"))
        self.status.set({"ok": True, "error": "", "count": n, "at": fs.SERVER_TIMESTAMP})
        self.last_modified = meta.get("modifiedTime")
        return True

    def push_gear(self, docs):
        """Notifications about equipment: a new request to the direct manager, an answer to the one who asked."""
        tokens = {}
        for d in self.db.collection("subs").stream():
            tokens[d.id] = (d.to_dict() or {}).get("tokens", []) or []
        admins = [d.id for d in self.db.collection("admins").stream()]
        words = {"approved": "אושרה ✅", "changes": "הוחזרה לתיקון ✏️", "rejected": "נדחתה"}
        for d in docs:
            g = d.to_dict() or {}
            link = (g.get("site") or "https://guydag.github.io/biconverter/") + "#gear"
            try:
                if g.get("pushTo") == "owner":
                    st = g.get("status", "")
                    note = ((g.get("review") or {}).get("note") or "")
                    n = send_push(self.db, tokens, [g.get("uid", "")], "בקשת הציוד שלך " + words.get(st, "עודכנה"),
                                  (g.get("unit") or "") + " · " + (g.get("date") or "") + (" · " + note if note else ""), link)
                else:
                    to = [x for x in (g.get("notifyTo") or []) if x != g.get("uid")] or [a for a in admins if a != g.get("uid")]
                    n = send_push(self.db, tokens, to, "בקשת ציוד חדשה לאישור 📦",
                                  (g.get("byName") or "") + " · " + (g.get("unit") or "") + " · " + str(len(g.get("items") or [])) + " פריטים", link)
                print("Gear push", d.id, "->", n, "devices")
            except Exception as e:
                print("Gear push failed:", e)
            d.reference.set({"push": "done"}, merge=True)

    def watch(self, minutes):
        """Keep watching for a while: a change in the site or in the Excel goes through within seconds."""
        import threading
        flags = {"ops": threading.Event(), "cfg": threading.Event(), "people": threading.Event(), "gear": threading.Event()}
        state = {"users": {}, "gear": []}

        def on_ops(snaps, changes, read_time):
            if snaps:
                flags["ops"].set()

        def on_cfg(snaps, changes, read_time):
            for s in snaps:
                self.hidden = (s.to_dict() or {}).get("hidden", {}) or {}
            flags["cfg"].set()

        def on_users(snaps, changes, read_time):
            state["users"] = {s.id: (s.to_dict() or {}) for s in snaps}
            flags["people"].set()

        def on_gear(snaps, changes, read_time):
            state["gear"] = list(snaps)
            if snaps:
                flags["gear"].set()

        w = [self.db.collection("cal_ops").where("state", "==", "pending").on_snapshot(on_ops),
             self.db.collection("config").document("calendar").on_snapshot(on_cfg),
             self.db.collection("users").on_snapshot(on_users),
             self.db.collection("gear").where("push", "==", "todo").on_snapshot(on_gear)]
        time.sleep(3)
        self.once()
        end = time.time() + minutes * 60
        last_drive = time.time()
        while time.time() < end:
            time.sleep(1.5)
            try:
                if flags["people"].is_set():
                    flags["people"].clear()
                    publish_people(self.db, self.fs, state["users"])
                if flags["gear"].is_set():
                    flags["gear"].clear()
                    self.push_gear(state["gear"])
                if flags["ops"].is_set():
                    flags["ops"].clear()
                    time.sleep(1)  # let a burst of edits arrive together
                    self.once(reload=False)
                    last_drive = time.time()
                    continue
                if flags["cfg"].is_set():
                    flags["cfg"].clear()
                    self.written = {}
                    if self.book is not None:
                        self.store(self.book, self.last_modified)
                if time.time() - last_drive >= 20:
                    last_drive = time.time()
                    m = drive_meta(self.s).get("modifiedTime")
                    if m != self.last_modified:
                        print(time.strftime("%H:%M:%S"), "The Excel changed in Drive.")
                        self.once([])
            except Exception as e:  # a network hiccup should not end the watch
                print("Retrying after error:", e)
                time.sleep(10)
        for x in w:
            try:
                x.unsubscribe()
            except Exception:
                pass


def run_actions(watch_minutes=0):
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not raw:
        print("FIREBASE_SERVICE_ACCOUNT is not set; nothing to do.")
        return
    sync = Sync(json.loads(raw))
    if watch_minutes:
        sync.watch(watch_minutes)
    else:
        cfg = sync.db.collection("config").document("calendar").get()
        sync.hidden = (cfg.to_dict() or {}).get("hidden", {}) if cfg.exists else {}
        publish_people(sync.db, sync.fs, {d.id: d.to_dict() for d in sync.db.collection("users").stream()})
        sync.once()


def main():
    args = sys.argv[1:]
    if "--file" not in args:
        run_actions(int(args[args.index("--watch") + 1]) if "--watch" in args else 0)
        return
    path = args[args.index("--file") + 1]
    book = Book(open(path, "rb").read())
    if "--ops" in args:
        ops = json.load(open(args[args.index("--ops") + 1], encoding="utf-8"))
        print(json.dumps(apply_ops(book, ops), ensure_ascii=False, indent=1))
        if "--out" in args:
            open(args[args.index("--out") + 1], "wb").write(book.save())
            book = Book(book.save())
    sheets, legend = load(book)
    evs = all_events(sheets, legend)
    print(len(evs), "events;", {k[2:]: v for k, v in legend.items()})
    if "--dump" in args:
        json.dump(evs, open(args[args.index("--dump") + 1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()

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
from collections import Counter
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


# ---------- keeping each day packed: events in the top rows under the date ----------
def _has_text(sh, c, r):
    v = sh.value(c, r)
    return v is not None and str(v).strip() != ""


def _plan_week(sh, w):
    """Where the events of one week go: under each date the top rows fill first, with the events that cover several
    days at the top (each in a place free on all its days and rows), then the others in their order.
    Cells outside the month's days stay where they are."""
    rows, cols = w["rows"], sorted(w["days"])
    if not rows or not cols:
        return []
    items, seen = [], set()
    for r in rows:
        for c in range(1, GRID_COLS + 1):
            if (c, r) in seen:
                continue
            mg = sh.merge_at(c, r)
            if mg:
                seen.update((cc, rr) for cc in range(mg[0], mg[2] + 1) for rr in range(mg[1], mg[3] + 1))
                if not _has_text(sh, mg[0], mg[1]):
                    continue
                movable = all(cc in cols for cc in range(mg[0], mg[2] + 1)) and all(rr in rows for rr in range(mg[1], mg[3] + 1))
                items.append({"c0": mg[0], "c1": mg[2], "r": mg[1], "h": mg[3] - mg[1] + 1, "fixed": not movable, "merge": mg})
            elif _has_text(sh, c, r):
                seen.add((c, r))
                items.append({"c0": c, "c1": c, "r": r, "h": 1, "fixed": c not in cols, "merge": None})
    # Fixed cells first, then the events that cover the most days (and rows), then the rest in their order:
    # each goes to the topmost place free on all its days and rows.
    taken, moves = set(), []
    for it in sorted(items, key=lambda x: (not x["fixed"], -(x["c1"] - x["c0"] + 1), -x["h"], x["r"], x["c0"])):
        span = range(it["c0"], it["c1"] + 1)
        dest = it["r"]
        if not it["fixed"]:
            dest = None
            for i, r in enumerate(rows):
                block = rows[i:i + it["h"]]
                if len(block) == it["h"] and block[-1] - block[0] == it["h"] - 1 and all(
                        (cc, rr) not in taken for cc in span for rr in block):
                    dest = r
                    break
            if dest is None:  # no room in this order: leave the week as it is
                return []
        for cc in span:
            for rr in range(dest, dest + it["h"]):
                taken.add((cc, rr))
        if dest != it["r"]:
            moves.append((it, dest))
    return moves


def compact_sheet(sh):
    """Move events up so no day has an empty cell above one of its events. Returns how many moved."""
    moves = []
    for w in sh.weeks:
        moves += _plan_week(sh, w)
    if not moves:
        return 0

    def xml_of(c, r):
        m = sh._cell_re(ref_of(c, r)).search(sh.xml)
        return m.group(0) if m else '<c r="%s"/>' % ref_of(c, r)

    blanks = {r: blank_style(sh, r) for it, _ in moves for r in range(it["r"], it["r"] + it["h"])}
    saved = [(it, dest, {(cc, k): xml_of(cc, it["r"] + k) for cc in range(it["c0"], it["c1"] + 1) for k in range(it["h"])})
             for it, dest in moves]
    for it, _, _ in saved:  # empty the old places first
        if it["merge"]:
            sh.remove_merge(it["merge"])
        for cc in range(it["c0"], it["c1"] + 1):
            for k in range(it["h"]):
                sh.set_cell(cc, it["r"] + k, "", blanks[it["r"] + k])
    for it, dest, xmls in saved:
        for (cc, k), x in xmls.items():
            ref = ref_of(cc, dest + k)
            x = re.sub(r'^<c r="[A-Z]+\d+"', '<c r="%s"' % ref, x)
            rx = sh._cell_re(ref)
            if rx.search(sh.xml):
                sh.xml = rx.sub(lambda m: x, sh.xml, count=1)
            else:
                sh._insert_cell(cc, dest + k, x)
        if it["merge"]:
            ref = "%s:%s" % (ref_of(it["c0"], dest), ref_of(it["c1"], dest + it["h"] - 1))
            sh.xml = re.sub(r"</mergeCells>", '<mergeCell ref="%s"/></mergeCells>' % ref, sh.xml, count=1)
            sh._recount()
    sh.book.changed.add(sh.path)
    sh.commit()
    sh.read()
    return len(moves)

def _fonts_and_xfs(book):
    """Font size of every cell style, and which styles wrap their text."""
    xml = book.files["xl/styles.xml"].decode("utf-8")
    fonts = re.search(r"<fonts\b[^>]*>(.*?)</fonts>", xml, re.S).group(1)
    sizes = []
    for f in re.findall(r"<font\b[^>]*/>|<font\b[^>]*>.*?</font>", fonts, re.S):
        m = re.search(r'<sz val="([\d.]+)"', f)
        sizes.append(float(m.group(1)) if m else 11.0)
    xfs = re.findall(r"<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>", re.search(r"<cellXfs\b[^>]*>(.*?)</cellXfs>", xml, re.S).group(1), re.S)
    out = []
    for x in xfs:
        m = re.search(r'fontId="(\d+)"', x)
        out.append({"size": sizes[int(m.group(1))] if m and int(m.group(1)) < len(sizes) else 11.0, "wrap": 'wrapText="1"' in x})
    return out


def ensure_wrap(book, styles):
    """Make these cell styles wrap their text (so a long event goes on to the next line)."""
    xml = book.files["xl/styles.xml"].decode("utf-8")
    m = re.search(r"(<cellXfs\b[^>]*>)(.*?)(</cellXfs>)", xml, re.S)
    items = re.findall(r"<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>", m.group(2), re.S)
    changed = False
    for i in {int(x) for x in styles if x is not None and str(x).isdigit()}:
        x = items[i]
        if 'wrapText="1"' in x:
            continue
        if "<alignment" in x:
            x = re.sub(r"<alignment\b", '<alignment wrapText="1"', x, count=1)
            x = re.sub(r'wrapText="0"', "", x)
        elif x.endswith("/>"):
            x = x[:-2] + '><alignment wrapText="1" vertical="center" horizontal="center"/></xf>'
        else:
            x = x.replace("</xf>", '<alignment wrapText="1" vertical="center" horizontal="center"/></xf>')
        if "applyAlignment=" not in x:
            x = x.replace("<xf ", '<xf applyAlignment="1" ', 1)
        items[i] = x
        changed = True
    if changed:
        xml = xml[:m.start(2)] + "".join(items) + xml[m.end(2):]
        book.files["xl/styles.xml"] = xml.encode("utf-8")
        book._styles()


def _col_widths(sh):
    w = {}
    for m in re.finditer(r"<col\b([^>]*)/?>", sh.xml):
        a = m.group(1)
        lo, hi, wd = re.search(r'min="(\d+)"', a), re.search(r'max="(\d+)"', a), re.search(r'width="([\d.]+)"', a)
        if lo and hi and wd:
            for c in range(int(lo.group(1)), int(hi.group(1)) + 1):
                w[c] = float(wd.group(1))
    d = re.search(r'defaultColWidth="([\d.]+)"', sh.xml)
    return w, float(d.group(1)) if d else 12.63


def _lines(text, chars):
    n = 0
    for para in str(text).split("\n"):
        words, cur = para.split(), 0
        if not words:
            n += 1
            continue
        n += 1
        for wd in words:
            L = len(wd)
            if cur and cur + 1 + L > chars:
                n += 1
                cur = 0
            while L > chars:  # a word longer than the line breaks too
                n += 1
                L -= chars
            cur = (cur + 1 + L) if cur else L
    return n


def fit_rows(sh):
    """Give every event row of the calendar the height its text needs (wrapped), so nothing is cut off.
    Returns how many rows changed."""
    info = _fonts_and_xfs(sh.book)
    widths, dflt = _col_widths(sh)
    need, styles = {}, []
    for w in sh.weeks:
        for r in w["rows"]:
            for c in range(1, GRID_COLS + 1):
                if not _has_text(sh, c, r):
                    continue
                mg = sh.merge_at(c, r)
                if mg and (mg[0], mg[1]) != (c, r):
                    continue
                c1, r1 = (mg[2], mg[3]) if mg else (c, r)
                st = sh.cells[(c, r)]["s"]
                styles.append(st)
                size = info[int(st)]["size"] if st is not None and str(st).isdigit() and int(st) < len(info) else 11.0
                width = sum(widths.get(k, dflt) for k in range(c, c1 + 1))
                chars = max(4, int(width * 11.0 / size * 1.2) - 1)
                h = _lines(sh.value(c, r), chars) * size * 1.38 + 5
                rows = list(range(r, r1 + 1))
                per = h / len(rows)
                for rr in rows:
                    need[rr] = max(need.get(rr, 0), per)
    ensure_wrap(sh.book, styles)
    changed = 0
    for w in sh.weeks:
        for r in w["rows"]:
            want = max(15.75, round(need.get(r, 0) * 4) / 4)
            m = re.search(r'<row r="%d"([^>]*?)(/?)>' % r, sh.xml)
            if not m:
                continue
            ht = re.search(r'ht="([\d.]+)"', m.group(1))
            cur = float(ht.group(1)) if ht else 15.0
            if abs(cur - want) < 0.5:
                continue
            attrs = re.sub(r'\s(ht|customHeight)="[^"]*"', "", m.group(1)) + ' ht="%s" customHeight="1"' % want
            sh.xml = sh.xml[:m.start()] + '<row r="%d"%s%s>' % (r, attrs, m.group(2)) + sh.xml[m.end():]
            changed += 1
    if changed:
        sh.book.changed.add(sh.path)
        sh.commit()
    return changed


def box_borders(sh):
    """Every cell of the calendar grid (the event rows under the dates) gets a thin border on all four sides.
    Inside a merged cell the inner lines are not drawn, so a whole box is right there too. Returns how many changed."""
    book = sh.book
    xml = book.files["xl/styles.xml"].decode("utf-8")
    bm = re.search(r"(<borders\b[^>]*>)(.*?)(</borders>)", xml, re.S)
    borders = re.findall(r"<border\b[^>]*/>|<border\b[^>]*>.*?</border>", bm.group(2), re.S)
    full = None
    for i, b in enumerate(borders):
        if all(re.search(r'<%s style="thin"' % side, b) for side in ("left", "right", "top", "bottom")):
            full = i
            break
    if full is None:
        thin = '<%s style="thin"><color rgb="FF000000"/></%s>'
        borders.append("<border>%s%s%s%s<diagonal/></border>" % tuple(thin % (x, x) for x in ("left", "right", "top", "bottom")))
        full = len(borders) - 1
        xml = xml[:bm.start(2)] + "".join(borders) + xml[bm.end(2):]
        xml = re.sub(r'<borders count="\d+"', '<borders count="%d"' % len(borders), xml, count=1)
    xm = re.search(r"(<cellXfs\b[^>]*>)(.*?)(</cellXfs>)", xml, re.S)
    xfs = re.findall(r"<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>", xm.group(2), re.S)
    n0 = len(xfs)
    boxed = {}

    def boxed_style(st):
        st = "0" if st is None else str(st)
        if st in boxed:
            return boxed[st]
        x = xfs[int(st)]
        if re.search(r'borderId="%d"' % full, x):
            boxed[st] = st
            return st
        x = re.sub(r'borderId="\d+"', 'borderId="%d"' % full, x, count=1) if "borderId=" in x else x.replace("<xf ", '<xf borderId="%d" ' % full, 1)
        x = re.sub(r'applyBorder="\d"', 'applyBorder="1"', x) if "applyBorder=" in x else x.replace("<xf ", '<xf applyBorder="1" ', 1)
        xfs.append(x)
        boxed[st] = str(len(xfs) - 1)
        return boxed[st]

    todo = []
    for w in sh.weeks:
        for r in w["rows"]:
            for c in range(1, GRID_COLS + 1):
                cell = sh.cells.get((c, r))
                st = cell["s"] if cell else blank_style(sh, r)
                new = boxed_style(st)
                if cell is None or str(cell["s"]) != new:
                    todo.append((c, r, new, cell is None))
    if not todo:
        return 0
    if len(xfs) != n0:
        xml = xml[:xm.start(2)] + "".join(xfs) + xml[xm.end(2):]
        xml = re.sub(r'<cellXfs count="\d+"', '<cellXfs count="%d"' % len(xfs), xml, count=1)
    book.files["xl/styles.xml"] = xml.encode("utf-8")
    book._styles()
    for c, r, new, missing in todo:
        ref = ref_of(c, r)
        if missing:
            sh._insert_cell(c, r, '<c r="%s" s="%s"/>' % (ref, new))
            continue
        rx = re.compile(r'(<c r="%s")((?: [^>]*?)?)(/>|>)' % ref)
        m = rx.search(sh.xml)
        attrs = re.sub(r' s="\d+"', "", m.group(2))
        sh.xml = sh.xml[:m.start()] + m.group(1) + ' s="%s"' % new + attrs + m.group(3) + sh.xml[m.end():]
    book.changed.add(sh.path)
    sh.commit()
    sh.read()
    return len(todo)


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
    # A deleted or moved event leaves a gap: move the events below it up (only in the month sheets that changed).
    if any(o["kind"] in ("delete", "move") and results.get(o["id"], {}).get("ok") for o in order):
        before = sorted((e["date"], e["end"], e["title"], e.get("time", ""), e.get("color", "")) for e in all_events(sheets, legend))
        snap = {sh.path: sh.xml for sh in sheets}
        moved = sum(compact_sheet(sh) for sh in sheets if sh.month and sh.path in book.changed)
        after = sorted((e["date"], e["end"], e["title"], e.get("time", ""), e.get("color", "")) for e in all_events(sheets, legend))
        if before != after:  # never let the packing change an event: undo it
            for sh in sheets:
                if sh.xml != snap[sh.path]:
                    sh.xml = snap[sh.path]
                    sh.commit()
                    sh.read()
            print("Packing skipped: it would have changed events")
        elif moved:
            print("Packed", moved, "events up")
    # Rows fit their text (an event may have moved into a row that was too short for it).
    for sh in sheets:
        if sh.month and sh.path in book.changed:
            fit_rows(sh)
            box_borders(sh)
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


SITE = "https://guydag.github.io/masuot_forum/"


def site_url(saved):
    """The site a link should open: the one the item was made on (live or test), at the site's current address."""
    saved = (saved or SITE).replace("/biconverter/", "/masuot_forum/")
    return saved if saved.startswith("https://guydag.github.io/masuot_forum/") else SITE


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
            notification=messaging.WebpushNotification(title=title, body=body, icon="https://guydag.github.io/masuot_forum/icon-192.png?v=3", badge="https://guydag.github.io/masuot_forum/icon-192.png?v=3", direction="rtl", language="he"),
            fcm_options=messaging.WebpushFCMOptions(link=link))))
    for r, t in zip(res.responses, tokens):
        code = getattr(r.exception, "code", "") if r.exception else ""
        if r.exception and ("not-registered" in str(code).lower() or "unregistered" in str(code).lower() or "invalid" in str(code).lower()):
            from firebase_admin import firestore as fs
            db.collection("subs").document(owners[t]).set({"tokens": fs.ArrayRemove([t])}, merge=True)
    return res.success_count


def price_key(name):
    """The same item written a little differently gets the same price."""
    k = re.sub(r"\s+", " ", str(name or "")).strip().lower()
    return re.sub(r"[.~*/\[\]`]", "-", k)[:120]


def gemini(prompt, schema=None, search=False):
    """One request to Gemini (free tier). Returns the text of the answer and the raw first candidate.
    Google retires models for new keys without warning (they answer 404), so it tries a short list of current
    models and keeps the first one that answers."""
    import urllib.request
    import urllib.error
    global PRICE_MODEL
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.3}}
    if search:
        body["tools"] = [{"google_search": {}}]
    if schema:
        body["generationConfig"].update({"responseMimeType": "application/json", "responseSchema": schema})
    models = [PRICE_MODEL] + [m for m in GEMINI_MODELS if m != PRICE_MODEL]
    last = None
    for model in models:
        url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                res = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (404, 400):  # this model isn't served to this key (or can't do this): try the next
                print("Gemini", model, "->", e.code, e.read().decode(errors="ignore")[:200])
                continue
            raise
        if model != PRICE_MODEL:
            print("Gemini model now", model)
            PRICE_MODEL = model
        cand = (res.get("candidates") or [{}])[0]
        return "".join(p.get("text", "") for p in ((cand.get("content") or {}).get("parts") or [])), cand
    raise last

def ask_price(key, name):
    """Gemini (free tier) with Google Search: the usual price in Israel of one unit of the item. Returns a dict or None."""
    import urllib.request
    import urllib.parse
    prompt = (
        "פריט מתוך בקשת ציוד של שבט צופים בישראל: \"" + name + "\".\n"
        "חפש בגוגל את המחיר הרגיל לצרכן בישראל, בשקלים, של יחידה אחת של הפריט (כפי שסופרים אותו בבקשה; "
        "למשל חבילה אם השם הוא חבילה, אחרת פריט בודד). העדף חנויות ישראליות מוכרות או זאפ.\n"
        "ענה רק ב-JSON בשורה אחת, בלי שום טקסט נוסף: "
        "{\"price\": מספר או null, \"unit\": \"על מה המחיר, בקצרה\", \"store\": \"שם החנות או האתר\", \"url\": \"קישור לעמוד המוצר\"}"
    )
    text, cand = gemini(prompt, search=True)
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except Exception:
        return None
    try:
        price = float(d.get("price")) if d.get("price") not in (None, "") else None
    except Exception:
        price = None
    if price is not None and not (0 < price < 20000):
        price = None
    # Keep a link only to a site Google Search really returned (the model can make up addresses).
    hosts = [((c.get("web") or {}).get("title") or "").lower() for c in ((cand.get("groundingMetadata") or {}).get("groundingChunks") or [])]
    link = str(d.get("url") or "")
    host = urllib.parse.urlparse(link).hostname or ""
    host = host.lower().removeprefix("www.")
    if not (link.startswith("http") and host and any(h and (h.removeprefix("www.") in host or host in h) for h in hosts)):
        link = ("https://" + hosts[0]) if hosts and hosts[0] and "." in hosts[0] else ""
        d["store"] = hosts[0] if link else d.get("store")
    return {"name": name, "price": round(price, 2) if price is not None else None, "unit": str(d.get("unit") or "")[:60],
            "store": str(d.get("store") or "")[:60], "src": link[:500], "by": "ai"}


GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]
PRICE_MODEL = GEMINI_MODELS[0]


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

    def claim(self, ops):
        """Take the waiting changes for this run: each becomes "working", so the site no longer changes or cancels it
        while it is written to the Excel. Returns the changes as they are now."""
        fs, db, out = self.fs, self.db, []
        for o in ops:
            ref = db.collection("cal_ops").document(o["id"])

            @fs.transactional
            def take(tx, ref=ref):
                snap = ref.get(transaction=tx)
                if not snap.exists or (snap.to_dict() or {}).get("state") != "pending":
                    return None
                tx.update(ref, {"state": "working"})
                d = snap.to_dict()
                d["id"] = ref.id
                return d
            try:
                d = take(db.transaction())
            except Exception as e:
                print("Could not take a change:", e)
                d = None
            if d:
                out.append(d)
        return out

    def release(self, ops):
        for o in ops:
            try:
                self.db.collection("cal_ops").document(o["id"]).update({"state": "pending"})
            except Exception:
                pass

    def release_stuck(self):
        """Changes left "working" by a run that stopped in the middle go back to waiting."""
        for d in self.db.collection("cal_ops").where("state", "==", "working").stream():
            d.reference.update({"state": "pending"})

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
            ops = self.claim(ops)
        if ops:
            try:
                results = apply_ops(book, ops)
                if book.changed:
                    # Upload only if the file did not change in Drive since we read it.
                    now = drive_meta(s)
                    if now.get("headRevisionId") != meta.get("headRevisionId") or now.get("modifiedTime") != meta.get("modifiedTime"):
                        print("The file changed in Drive while syncing; trying again in a moment.")
                        self.book = None
                        self.release(ops)
                        return True
                    new_bytes = book.save()
                    drive_upload(s, new_bytes)
                    book = self.book = Book(new_bytes)
                    meta = drive_meta(s)
            except Exception:
                self.book = None
                self.release(ops)
                raise
            for o in ops:
                r = results.get(o["id"], {"ok": False, "error": "לא טופל"})
                db.collection("cal_ops").document(o["id"]).set(
                    {"state": "done" if r.get("ok") else "failed", "error": r.get("error", ""), "doneAt": fs.SERVER_TIMESTAMP}, merge=True)
            print(time.strftime("%H:%M:%S"), "Applied", len(ops), "changes:", results)
        n = self.store(book, meta.get("modifiedTime"))
        self.status.set({"ok": True, "error": "", "count": n, "at": fs.SERVER_TIMESTAMP})
        self.last_modified = meta.get("modifiedTime")
        return True

    def remind_bogers(self):
        """Three days and one day before an activity: a reminder to whoever booked an area that needs a בוגר and hasn't written one."""
        from zoneinfo import ZoneInfo
        now = dt.datetime.now(ZoneInfo("Asia/Jerusalem"))
        if now.hour < 17:  # in the evening, not in the middle of the night
            return
        need = {"fire": "איזור אש", "out": "פעילות מחוץ לשבט"}
        tokens = None
        for days, key in ((3, "remind3"), (1, "remind1")):
            day = (now.date() + dt.timedelta(days=days)).isoformat()
            for d in self.db.collection("bookings").where("date", "==", day).stream():
                b = d.to_dict() or {}
                f = b.get("fields") or {}
                if b.get("area") not in need or b.get("imported") or (f.get("boger") or "").strip() or b.get(key) or not b.get("uid"):
                    continue
                if tokens is None:
                    tokens = {x.id: (x.to_dict() or {}).get("tokens", []) or [] for x in self.db.collection("subs").stream()}
                when = "בעוד 3 ימים" if days == 3 else "מחר"
                place = need[b["area"]] + (" · " + f["where"] if b.get("area") == "out" and f.get("where") else "")
                link = site_url(b.get("site")) + "#book"
                try:
                    n = send_push(self.db, tokens, [b["uid"]], "חסר בוגר בשריון ⚠️", place + " " + when + " · " + (f.get("unit") or "") + " · אפשר להוסיף בוגר בשריון", link)
                    print("Boger reminder", d.id, key, "->", n, "devices")
                except Exception as e:
                    print("Boger reminder failed:", e)
                d.reference.set({key: True}, merge=True)

    def period_stats(self, frm, to, pfrm, pto, today):
        """Counts only (no names of people) between two dates (inclusive), for the summary in words:
        the calendar, bookings, equipment and site use, with the period before it for comparison."""
        inr = lambda d, a, b: bool(d) and a <= d[:10] <= b
        st = {"from": frm, "to": to, "today": today}
        snap = self.db.collection("cal").document("all").get()
        evs = json.loads((snap.to_dict() or {}).get("events") or "[]") if snap.exists else []
        cur = [e for e in evs if inr(str(e.get("date", "")), frm, to)]
        st["calendar"] = {"events": len(cur), "events_period_before": sum(1 for e in evs if inr(str(e.get("date", "")), pfrm, pto)),
                          "by_category": Counter(e.get("cat") or "בלי קטגוריה" for e in cur).most_common(8),
                          "titles": sorted({(e.get("title") or "").strip()[:60] for e in cur if (e.get("title") or "").strip()})[:25]}
        names = {"fire": "איזור אש", "out": "פעילות מחוץ לשבט"}
        bk, gap = [], []
        week = (dt.date.fromisoformat(today) + dt.timedelta(days=7)).isoformat()
        for d in self.db.collection("bookings").stream():
            b = d.to_dict() or {}
            day = str(b.get("date") or "")
            f = b.get("fields") or {}
            if inr(day, frm, to):
                bk.append(b)
            if today <= day <= week and b.get("area") in names and not (f.get("boger") or "").strip() and not b.get("imported"):
                gap.append(f.get("unit") or "בלי גדוד")
        st["bookings"] = {"in_period": len(bk), "by_area": Counter(b.get("areaName") or b.get("area") or "" for b in bk).most_common(6),
                          "coming_7_days_without_boger": gap}
        gear, waits, old = [], [], 0
        now = time.time()
        day_of = lambda t: dt.datetime.fromtimestamp(t, dt.timezone(dt.timedelta(hours=2))).date().isoformat()
        for d in self.db.collection("gear").stream():
            g = d.to_dict() or {}
            at = g.get("at")
            t = at.timestamp() if hasattr(at, "timestamp") else None
            if t and inr(day_of(t), frm, to):
                gear.append(g)
            rv = g.get("review") or {}
            if t and rv.get("at") and g.get("status") in ("approved", "rejected", "changes") and inr(day_of(rv["at"] / 1000), frm, to):
                waits.append(max(0, rv["at"] / 1000 - t) / 86400)
            if g.get("status") == "pending" and t and now - t > 7 * 86400:
                old += 1
        units = Counter(g.get("unit") or "בלי גדוד" for g in gear)
        items = Counter()
        for g in gear:
            for it in g.get("items") or []:
                items[re.sub(r"\s+", " ", str(it.get("name") or "")).strip()] += int(it.get("qty") or 1)
        st["equipment"] = {"new_requests": len(gear), "by_unit": units.most_common(8),
                           "top_items": items.most_common(8), "average_days_to_answer": round(sum(waits) / len(waits), 1) if waits else None,
                           "pending_more_than_7_days_now": old}
        roles = {d.id: (d.to_dict() or {}).get("role") or "" for d in self.db.collection("users").stream()}
        act = set()
        for d in self.db.collection("usage").where("day", ">=", frm).stream():
            u = d.to_dict() or {}
            if inr(str(u.get("day", "")), frm, to):
                act.add(u.get("email"))
        st["site"] = {"users": len(roles), "active_in_period": len(act), "active_by_role": Counter(roles.get(e, "") or "לא ידוע" for e in act).most_common(8)}
        return st

    def summaries(self):
        """In words, kept in config/summary: every Sunday (from 06:00) the week that ended, and on the 1st of the month
        the month that ended. The first time, the last full week right away."""
        if not os.environ.get("GEMINI_API_KEY"):
            return
        from zoneinfo import ZoneInfo
        now = dt.datetime.now(ZoneInfo("Asia/Jerusalem"))
        if now.hour < 6:
            return
        today = now.date()
        ref = self.db.collection("config").document("summary")
        snap = ref.get()
        have = ((snap.to_dict() or {}).get("periods") or {}) if snap.exists else {}
        todo = []
        sun = today - dt.timedelta(days=(today.weekday() + 1) % 7)  # this week's Sunday
        ws, we = sun - dt.timedelta(days=7), sun - dt.timedelta(days=1)
        if "w" + ws.isoformat() not in have:
            todo.append(("week", "w" + ws.isoformat(), ws, we, ws - dt.timedelta(days=7), ws - dt.timedelta(days=1)))
        first = today.replace(day=1)
        me_ = first - dt.timedelta(days=1)
        ms = me_.replace(day=1)
        pme = ms - dt.timedelta(days=1)
        if "m" + ms.strftime("%Y-%m") not in have and (today.day <= 7 or not have):
            todo.append(("month", "m" + ms.strftime("%Y-%m"), ms, me_, pme.replace(day=1), pme))
        schema = {"type": "OBJECT", "properties": {"text": {"type": "STRING"}, "items": {"type": "ARRAY", "items": {"type": "OBJECT",
                  "properties": {"kind": {"type": "STRING", "enum": ["alert", "watch", "good"]}, "text": {"type": "STRING"}}, "required": ["kind", "text"]}}},
                  "required": ["text", "items"]}
        for kind, key, a, b, pa, pb in todo:
            st = self.period_stats(a.isoformat(), b.isoformat(), pa.isoformat(), pb.isoformat(), today.isoformat())
            what = "השבוע שעבר (ראשון עד שבת)" if kind == "week" else "החודש שעבר"
            prompt = (
                "אתה כותב סיכום קצר של " + what + " לעמוד התובנות של אתר פנימי של שבט צופים (שבט משואות). הקוראים הם מנהלי השבט.\n"
                "כתוב בעברית טבעית, חמה ועניינית, בלי להמציא שום דבר: השתמש רק במספרים ובשמות שבנתונים. "
                "השוואה לתקופה שלפני מותרת רק לפי events_period_before, ואל תחשב אחוזים אם אין בסיס להשוואה.\n"
                "text: פסקה אחת של 2–3 משפטים על איך " + ("השבוע" if kind == "week" else "החודש") + " נראה (אפשר להזכיר אירועים בולטים מהכותרות).\n"
                "items: עד 3 נקודות קצרות (משפט אחד כל אחת), כל אחת עם kind: alert = משהו שצריך לטפל בו עכשיו (למשל שריונים בשבוע הקרוב בלי בוגר), "
                "watch = משהו ששווה לשים לב אליו, good = חדשות טובות. אל תכתוב נקודה על משהו שאין בו מה לומר.\n"
                "הנתונים (JSON):\n" + json.dumps(st, ensure_ascii=False)
            )
            out, _ = gemini(prompt, schema)
            d = json.loads(out)
            items = [{"kind": i.get("kind") if i.get("kind") in ("alert", "watch", "good") else "watch", "text": str(i.get("text") or "")[:300]}
                     for i in (d.get("items") or []) if i.get("text")][:3]
            ref.set({"periods": {key: {"kind": kind, "from": a.isoformat(), "to": b.isoformat(), "text": str(d.get("text") or "")[:1200],
                                        "items": items, "day": today.isoformat(), "at": self.fs.SERVER_TIMESTAMP}}}, merge=True)
            print("Summary", key, "written")
            time.sleep(7)

    def find_prices(self, limit=25):
        """Look up the price of equipment items that have none yet (each item once; a failed one is tried again after a day)."""
        if not os.environ.get("GEMINI_API_KEY"):
            return
        ref = self.db.collection("config").document("prices")
        snap = ref.get()
        known = ((snap.to_dict() or {}).get("items") or {}) if snap.exists else {}
        now = time.time()
        todo = {}
        for d in self.db.collection("gear").stream():
            for it in ((d.to_dict() or {}).get("items") or []):
                name = re.sub(r"\s+", " ", str(it.get("name") or "")).strip()
                k = price_key(name)
                if not k or k in todo:
                    continue
                p = known.get(k)
                if p and (p.get("by") == "manual" or p.get("price") is not None or p.get("tries", 0) >= 3 or now - p.get("t", 0) < 86400):
                    continue
                todo[k] = (name, (p or {}).get("tries", 0))
        for i, (k, (name, tries)) in enumerate(list(todo.items())[:limit]):
            try:
                r = ask_price(k, name)
            except Exception as e:
                msg = str(e)
                print("Price lookup failed:", name, msg[:200])
                if "429" in msg:  # the free daily quota is used up: try again later
                    return
                r = None
            entry = r if r and r.get("price") is not None else {"name": name, "price": None, "by": "ai"}
            entry["t"] = now
            entry["tries"] = tries + 1
            if entry.get("price") is not None:
                entry["tries"] = 0
            ref.set({"items": {k: entry}}, merge=True)
            print("Price", name, "->", entry.get("price"), entry.get("store", ""))
            time.sleep(7)  # stay under the free per-minute limit

    def push_gear(self, docs):
        """Notifications about equipment: a new request to the direct manager, an answer to the one who asked."""
        tokens = {}
        for d in self.db.collection("subs").stream():
            tokens[d.id] = (d.to_dict() or {}).get("tokens", []) or []
        admins = [d.id for d in self.db.collection("admins").stream()]
        words = {"approved": "אושרה ✅", "changes": "הוחזרה לתיקון ✏️", "rejected": "נדחתה"}
        for d in docs:
            g = d.to_dict() or {}
            link = site_url(g.get("site")) + "#gear"
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
        self.release_stuck()
        self.once()
        end = time.time() + minutes * 60
        last_drive = time.time()
        last_remind = 0
        last_price = time.time() - 840
        last_sum = 0
        last_beat = 0
        while time.time() < end:
            time.sleep(1.5)
            try:
                if time.time() - last_beat >= 60:  # the site and the notifier check this to see that the sync is alive
                    last_beat = time.time()
                    self.db.collection("public").document("health").set({"sync": self.fs.SERVER_TIMESTAMP}, merge=True)
                if flags["people"].is_set():
                    flags["people"].clear()
                    publish_people(self.db, self.fs, state["users"])
                if time.time() - last_remind >= 600:
                    last_remind = time.time()
                    self.remind_bogers()
                if flags["gear"].is_set():
                    flags["gear"].clear()
                    self.push_gear(state["gear"])
                    last_price = 0
                if time.time() - last_sum >= 600:
                    last_sum = time.time()
                    try:
                        self.summaries()
                    except Exception as e:
                        print("Summary skipped:", e)
                if time.time() - last_price >= 900:
                    last_price = time.time()
                    try:
                        self.find_prices()
                    except Exception as e:
                        print("Prices skipped:", e)
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

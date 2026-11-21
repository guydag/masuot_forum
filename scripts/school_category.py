"""One-off: add the category "בית ספר" (grey) to the yearly schedule and colour every exam with it.

Run:  python scripts/school_category.py --file luz.xlsx --out new.xlsx   (local test)
      python scripts/school_category.py                                 (Drive, needs FIREBASE_SERVICE_ACCOUNT)
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import calsync as C  # noqa: E402

GREY = "FFD9D9D9"
NAME = "בית ספר"
EXAM = re.compile(r"מבחן|מבחנים|מתכונת|בגרות|בחינ")


def add_fill_styles(book, base_styles):
    """For each existing cell style, a copy of it with a grey background. Returns {old index: new index}."""
    xml = book.files["xl/styles.xml"].decode("utf-8")
    fills = re.search(r"<fills count=\"(\d+)\"[^>]*>(.*?)</fills>", xml, re.S)
    n_fills = int(fills.group(1))
    new_fill = '<fill><patternFill patternType="solid"><fgColor rgb="%s"/><bgColor indexed="64"/></patternFill></fill>' % GREY
    xml = xml[:fills.start(2)] + fills.group(2) + new_fill + xml[fills.end(2):]
    xml = xml.replace('<fills count="%d"' % n_fills, '<fills count="%d"' % (n_fills + 1), 1)
    xfs = re.search(r"<cellXfs count=\"(\d+)\"[^>]*>(.*?)</cellXfs>", xml, re.S)
    items = re.findall(r"<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>", xfs.group(2), re.S)
    count = int(xfs.group(1))
    added, mapping = [], {}
    for s in sorted(set(base_styles)):
        xf = items[int(s)]
        xf = re.sub(r'fillId="\d+"', 'fillId="%d"' % n_fills, xf, count=1) if "fillId=" in xf else xf.replace("<xf ", '<xf fillId="%d" ' % n_fills, 1)
        xf = re.sub(r'applyFill="\d"', 'applyFill="1"', xf) if "applyFill=" in xf else xf.replace("<xf ", '<xf applyFill="1" ', 1)
        mapping[str(s)] = str(count + len(added))
        added.append(xf)
    xml = xml[:xfs.end(2)] + "".join(added) + xml[xfs.end(2):]
    xml = xml.replace('<cellXfs count="%d"' % count, '<cellXfs count="%d"' % (count + len(added)), 1)
    book.files["xl/styles.xml"] = xml.encode("utf-8")
    book._styles()
    return mapping


def set_style(sheet, col, row, style):
    ref = C.ref_of(col, row)
    rx = re.compile(r'(<c r="%s")((?: [^>]*?)?)(/>|>)' % ref)
    m = rx.search(sheet.xml)
    if not m:
        sheet._insert_cell(col, row, '<c r="%s" s="%s"/>' % (ref, style))
    else:
        attrs = re.sub(r' s="\d+"', "", m.group(2))
        sheet.xml = sheet.xml[:m.start()] + m.group(1) + ' s="%s"' % style + attrs + m.group(3) + sheet.xml[m.end():]
    sheet.book.changed.add(sheet.path)


def run(book):
    sheets, legend = C.load(book)
    if NAME in legend.values():
        print("The category is already there.")
    todo, legend_cells = [], []
    for sh in sheets:
        if not sh.month:
            continue
        for ev in sh.events(legend):
            if EXAM.search(ev["title"]):
                col, row = C.split_ref(ev["ref"])
                mg = sh.merge_at(col, row)
                cols = range(mg[0], mg[2] + 1) if mg else [col]
                for c in cols:
                    todo.append((sh, c, row))
        # the legend: the coloured names right of the grid
        rows = [(c, r) for (c, r), cell in sh.cells.items() if c > C.GRID_COLS and isinstance(cell["v"], str) and book.fill_of(cell["s"]) and len(cell["v"].strip()) < 40]
        if rows and not any(str(sh.value(c, r)).strip() == NAME for c, r in rows):
            c, r = max(rows, key=lambda x: x[1])
            legend_cells.append((sh, c, r + 1, sh.cells[(c, r)]["s"]))
    base = [sh.cells.get((c, r), {}).get("s") or "0" for sh, c, r in todo] + [s for *_, s in legend_cells]
    mapping = add_fill_styles(book, base)
    for sh, c, r in todo:
        set_style(sh, c, r, mapping[str(sh.cells.get((c, r), {}).get("s") or "0")])
    for sh, c, r, s in legend_cells:
        sh.set_cell(c, r, NAME, mapping[str(s)])
    for sh in sheets:
        if sh.path in book.changed:
            sh.commit()
    print("Exams coloured:", len(todo), "cells; legend rows added:", len(legend_cells))


def main():
    args = sys.argv[1:]
    if "--file" in args:
        src = args[args.index("--file") + 1]
        book = C.Book(open(src, "rb").read())
        run(book)
        open(args[args.index("--out") + 1], "wb").write(book.save())
        return
    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    s = C.drive_session(info)
    meta = C.drive_meta(s)
    book = C.Book(C.drive_download(s))
    run(book)
    now = C.drive_meta(s)
    if now.get("headRevisionId") != meta.get("headRevisionId"):
        sys.exit("The file changed in Drive meanwhile; run again.")
    C.drive_upload(s, book.save())
    print("Uploaded.")


if __name__ == "__main__":
    main()

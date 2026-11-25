"""One-off (25.11.2026): in the yearly schedule
  - rename the category "אילוצים / הדממות" to "אישי/הדממה" (the legend of every month sheet, colour kept);
  - colour the category "בית ספר" brown instead of grey (its events and its legend row).

Run:  python scripts/rename_category.py --file luz.xlsx --out new.xlsx   (local test)
      python scripts/rename_category.py                                 (Drive, needs FIREBASE_SERVICE_ACCOUNT)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import calsync as C  # noqa: E402
import school_category as S  # noqa: E402

OLD, NEW = "אילוצים / הדממות", "אישי/הדממה"
SCHOOL, BROWN = "בית ספר", "FFD7B899"


def run(book):
    sheets, legend = C.load(book)
    renamed, cells = 0, []
    for sh in sheets:
        for (c, r), cell in list(sh.cells.items()):
            if c > C.GRID_COLS and isinstance(cell["v"], str):
                name = cell["v"].strip()
                if name == OLD:
                    sh.set_cell(c, r, NEW, cell["s"])
                    renamed += 1
                elif name == SCHOOL:
                    cells.append((sh, c, r))
        if not sh.month:
            continue
        for ev in sh.events(legend):
            if ev.get("cat") == SCHOOL:
                col, row = C.split_ref(ev["ref"])
                mg = sh.merge_at(col, row)
                for c in (range(mg[0], mg[2] + 1) if mg else [col]):
                    cells.append((sh, c, row))
    S.GREY = BROWN  # add_fill_styles adds a fill of this colour
    mapping = S.add_fill_styles(book, [sh.cells.get((c, r), {}).get("s") or "0" for sh, c, r in cells])
    for sh, c, r in cells:
        S.set_style(sh, c, r, mapping[str(sh.cells.get((c, r), {}).get("s") or "0")])
    for sh in sheets:
        if sh.path in book.changed:
            sh.commit()
    print("Legend cells renamed:", renamed, "· school cells coloured brown:", len(cells))
    return renamed + len(cells)


def main():
    args = sys.argv[1:]
    if "--file" in args:
        book = C.Book(open(args[args.index("--file") + 1], "rb").read())
        run(book)
        open(args[args.index("--out") + 1], "wb").write(book.save())
        return
    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    s = C.drive_session(info)
    meta = C.drive_meta(s)
    book = C.Book(C.drive_download(s))
    if not run(book):
        return
    if C.drive_meta(s).get("headRevisionId") != meta.get("headRevisionId"):
        sys.exit("The file changed in Drive meanwhile; run again.")
    C.drive_upload(s, book.save())
    print("Uploaded.")


if __name__ == "__main__":
    main()

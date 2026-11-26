"""One-off: under every date, fill the top rows first: events move up into empty cells above them, so no day
has an empty cell above one of its events. Events keep their order within the day, their text, colour and length;
an event over several days moves only to a row free on all its days. Cells merged over several rows stay put.

Run:  python scripts/compact_schedule.py --file luz.xlsx --out new.xlsx   (local test)
      python scripts/compact_schedule.py                                 (Drive, needs FIREBASE_SERVICE_ACCOUNT)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import calsync as C  # noqa: E402


def run(book):
    sheets, legend = C.load(book)
    before = sorted((e["date"], e["end"], e["title"], e.get("time", ""), e.get("timeEnd", ""), e.get("color", "")) for e in C.all_events(sheets, legend))
    total = 0
    for sh in sheets:
        if not sh.month:
            continue
        n = C.compact_sheet(sh)
        f = C.fit_rows(sh)
        bx = C.box_borders(sh)
        ce = C.center_cells(sh)
        if n or f or bx or ce:
            print(sh.name, "moved up:", n, "· rows resized:", f, "· borders fixed:", bx, "· styles centred:", ce)
        total += n + f + bx + ce
    sheets2, legend2 = C.load(book)
    after = sorted((e["date"], e["end"], e["title"], e.get("time", ""), e.get("timeEnd", ""), e.get("color", "")) for e in C.all_events(sheets2, legend2))
    if before != after:
        missing = [x for x in before if x not in after][:10]
        extra = [x for x in after if x not in before][:10]
        sys.exit("Events changed, nothing saved. Missing: %s · new: %s" % (missing, extra))
    print("Events moved up:", total, "· all", len(after), "events unchanged")
    return total


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

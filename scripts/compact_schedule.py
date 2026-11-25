"""One-off: under every date, fill the top rows first: events move up into empty cells above them, so no day
has an empty cell above one of its events. Events keep their order within the day, their text, colour and length;
an event over several days moves only to a row free on all its days. Cells merged over several rows stay put.

Run:  python scripts/compact_schedule.py --file luz.xlsx --out new.xlsx   (local test)
      python scripts/compact_schedule.py                                 (Drive, needs FIREBASE_SERVICE_ACCOUNT)
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import calsync as C  # noqa: E402


def has_text(sh, c, r):
    v = sh.value(c, r)
    return v is not None and str(v).strip() != ""


def plan_week(sh, w):
    rows, cols = w["rows"], sorted(w["days"])
    if not rows or not cols:
        return []
    items, seen = [], set()
    for r in rows:
        for c in range(1, C.GRID_COLS + 1):
            if (c, r) in seen:
                continue
            mg = sh.merge_at(c, r)
            if mg:
                span = [(cc, rr) for cc in range(mg[0], mg[2] + 1) for rr in range(mg[1], mg[3] + 1)]
                seen.update(span)
                if not has_text(sh, mg[0], mg[1]):
                    continue
                movable = mg[1] == mg[3] and all(cc in cols for cc in range(mg[0], mg[2] + 1))
                items.append({"c0": mg[0], "c1": mg[2], "r": mg[1], "rows": (mg[1], mg[3]), "fixed": not movable, "merge": mg})
            elif has_text(sh, c, r):
                seen.add((c, r))
                items.append({"c0": c, "c1": c, "r": r, "rows": (r, r), "fixed": c not in cols, "merge": None})
    taken, last, moves = set(), {}, []
    for it in sorted(items, key=lambda x: (x["r"], x["c0"])):
        span = range(it["c0"], it["c1"] + 1)
        if it["fixed"]:
            for cc in span:
                for rr in range(it["rows"][0], it["rows"][1] + 1):
                    taken.add((cc, rr))
                last[cc] = max(last.get(cc, 0), it["rows"][1])
            continue
        dest = it["r"]
        for r in rows:
            if r > it["r"]:
                break
            if all((cc, r) not in taken and r > last.get(cc, 0) for cc in span):
                dest = r
                break
        for cc in span:
            taken.add((cc, dest))
            last[cc] = dest
        if dest != it["r"]:
            moves.append((it, dest))
    return moves


def cell_xml(sh, c, r):
    m = sh._cell_re(C.ref_of(c, r)).search(sh.xml)
    return m.group(0) if m else '<c r="%s"/>' % C.ref_of(c, r)


def put_xml(sh, c, r, xml):
    ref = C.ref_of(c, r)
    xml = re.sub(r'^<c r="[A-Z]+\d+"', '<c r="%s"' % ref, xml)
    rx = sh._cell_re(ref)
    if rx.search(sh.xml):
        sh.xml = rx.sub(lambda m: xml, sh.xml, count=1)
    else:
        sh._insert_cell(c, r, xml)
    sh.book.changed.add(sh.path)


def run(book):
    sheets, legend = C.load(book)
    before = sorted((e["date"], e["end"], e["title"], e.get("time", ""), e.get("timeEnd", ""), e.get("color", "")) for e in C.all_events(sheets, legend))
    total = 0
    for sh in sheets:
        if not sh.month:
            continue
        moves = []
        for w in sh.weeks:
            moves += plan_week(sh, w)
        if not moves:
            continue
        blanks = {it["r"]: C.blank_style(sh, it["r"]) for it, _ in moves}
        saved = [(it, dest, [cell_xml(sh, cc, it["r"]) for cc in range(it["c0"], it["c1"] + 1)]) for it, dest in moves]
        for it, _, _ in saved:  # empty the old places first
            if it["merge"]:
                sh.remove_merge(it["merge"])
            st = blanks[it["r"]]
            for cc in range(it["c0"], it["c1"] + 1):
                sh.set_cell(cc, it["r"], "", st)
        for it, dest, xmls in saved:
            for k, cc in enumerate(range(it["c0"], it["c1"] + 1)):
                put_xml(sh, cc, dest, xmls[k])
            if it["merge"]:
                sh.add_merge(it["c0"], dest, it["c1"])
        sh.commit()
        sh.read()
        total += len(moves)
        print(sh.name, "moved up:", len(moves))
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

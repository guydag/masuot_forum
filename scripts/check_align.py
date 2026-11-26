"""Read-only: print how the calendar cells of each month sheet are aligned."""
import collections, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import calsync as C
s = C.drive_session(json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"]))
print(C.drive_meta(s))
book = C.Book(C.drive_download(s))
xml = book.files["xl/styles.xml"].decode("utf-8")
items = re.findall(r"<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>", re.search(r"<cellXfs\b[^>]*>(.*?)</cellXfs>", xml, re.S).group(1), re.S)
sheets, legend = C.load(book)
for sh in sheets:
    if not sh.month:
        continue
    cnt = collections.Counter()
    for w in sh.weeks:
        for r in [w["row"]] + list(w["rows"]):
            for c in range(1, C.GRID_COLS + 1):
                cell = sh.cells.get((c, r))
                st = str(cell["s"]) if cell and cell["s"] is not None else "none"
                a = re.search(r"<alignment\b[^>]*>", items[int(st)]).group(0) if st.isdigit() and re.search(r"<alignment\b[^>]*>", items[int(st)]) else "-"
                cnt[(st, a, bool(cell and C._has_text(sh, c, r)))] += 1
    print(sh.name)
    for k, v in cnt.most_common(12):
        print("  ", v, k)
    break

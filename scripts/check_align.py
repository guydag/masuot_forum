"""Read-only: print row heights and the line estimate for November."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import calsync as C
s = C.drive_session(json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"]))
book = C.Book(C.drive_download(s))
sheets, legend = C.load(book)
sh = [x for x in sheets if x.name == "נובמבר"][0]
info = C._fonts_and_xfs(book)
widths, dflt = C._col_widths(sh)
print("widths", widths, dflt)
fx = book.files["xl/styles.xml"].decode()
print(re.search(r"<fonts\b.*?</fonts>", fx, re.S).group(0)[:1500])
for r in range(3, 20):
    m = re.search(r'<row r="%d"([^>]*?)/?>' % r, sh.xml)
    print("row", r, m.group(1) if m else None)
    for c in range(1, 8):
        if C._has_text(sh, c, r):
            mg = sh.merge_at(c, r)
            if mg and (mg[0], mg[1]) != (c, r):
                continue
            st = sh.cells[(c, r)]["s"]
            print("   ", c, repr(sh.value(c, r)), "style", st, info[int(st)], "merge", mg)

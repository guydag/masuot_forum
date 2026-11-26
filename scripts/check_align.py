"""Read-only test: how the sheets would be arranged now and next month (nothing is uploaded)."""
import datetime as dt, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import calsync as C
s = C.drive_session(json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"]))
raw = C.drive_download(s)
for day in (dt.date(2026, 11, 26), dt.date(2026, 12, 1)):
    book = C.Book(raw)
    ch = C.arrange_months(book, day)
    print(day, "changed:", ch, sorted(book.changed))
    print("  ", [x["name"] for x in book.sheets])
    for x in book.sheets:
        t = re.search(r"<tabColor[^>]*>", book.files[x["path"]].decode())
        print("    ", x["name"], t.group(0) if t else "-")
    if ch:
        b2 = C.Book(book.save())
        sh, lg = C.load(b2)
        print("   reload ok:", len(C.all_events(sh, lg)), "events")

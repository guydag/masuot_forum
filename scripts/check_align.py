"""Read-only: print the sheet order, tab colours and workbook settings."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import calsync as C
s = C.drive_session(json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"]))
book = C.Book(C.drive_download(s))
wb = book.files["xl/workbook.xml"].decode()
print(re.sub(r"<sheets>.*?</sheets>", "<sheets/>", wb, flags=re.S)[:3000])
print(re.search(r"<sheets>.*?</sheets>", wb, re.S).group(0))
for x in book.sheets:
    xml = book.files[x["path"]].decode()
    print(x["name"], x["path"], re.search(r"<sheetPr\b.*?(</sheetPr>|/>)", xml, re.S).group(0) if "<sheetPr" in xml else "-", "tabSelected" in xml)

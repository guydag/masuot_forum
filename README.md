# masuot_forum
## התראות לטלפון

הקוד נמצא באתר עצמו (הגדרות ← התראות, מוצג רק בטלפון) וב-`scripts/notify.js`, שרץ בחינם ב-GitHub Actions כל כמה דקות (`.github/workflows/notify.yml`) ושולח את ההתראות דרך Firebase Cloud Messaging.

להפעלה, פעם אחת:

1. ב-Firebase: Project settings ← Service accounts ← Generate new private key. יורד קובץ JSON.
2. ב-GitHub, במאגר: Settings ← Secrets and variables ← Actions ← New repository secret בשם `FIREBASE_SERVICE_ACCOUNT`, ולהדביק את כל תוכן הקובץ.
3. ב-`index.html` לשנות `PUSH_ENABLED` ל-`true`.

ההרצה הראשונה רק רושמת את הדוחות הקיימים ולא שולחת כלום.

/* Runs on GitHub Actions every few minutes (free). Looks for reports published since the last run
   and sends a push notification to the phones that follow them. */
const admin = require("firebase-admin");

const SITE = "https://guydag.github.io/masuot_forum/";
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.log("FIREBASE_SERVICE_ACCOUNT is not set yet; nothing to do."); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function main() {
  const metaRef = db.collection("meta").doc("push");
  const meta = await metaRef.get();
  const seen = meta.exists ? (meta.data().seen || {}) : null;

  const snap = await db.collection("factories").get();
  const now = {}, fresh = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const ts = d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0;
    now[doc.id] = ts;
    if (seen && (!(doc.id in seen) || ts > seen[doc.id])) fresh.push({ id: doc.id, d });
  });

  /* The very first run only records what already exists, so nobody gets a flood of old reports. */
  if (!seen) { await metaRef.set({ seen: now }); console.log("First run: recorded", Object.keys(now).length, "reports."); return; }
  if (!fresh.length) { console.log("Nothing new."); return; }

  const subs = await db.collection("subs").get();
  for (const f of fresh) {
    const name = f.d.name || f.id, uploader = String(f.d.by || "").toLowerCase();
    const owners = {};
    subs.forEach((doc) => {
      if (doc.id === uploader) return;
      const s = doc.data();
      const wants = s.all !== false || (Array.isArray(s.follows) && s.follows.includes(name));
      if (wants) (s.tokens || []).forEach((t) => { owners[t] = doc.id; });
    });
    const tokens = Object.keys(owners);
    const nNew = Array.isArray(f.d.fresh) ? f.d.fresh.length : 0;
    const body = (nNew === 0 ? "דוח חדש" : nNew === 1 ? "נרשם חדש אחד" : "נרשמו " + nNew + " חדשים") + " · " + f.d.rows + " רשומים סה״כ בדוח";
    console.log(name + ": sending to", tokens.length, "devices");
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        webpush: {
          notification: {
            title: name + " עודכן \uD83D\uDD14",
            body: body,
            icon: SITE + "icon-192.png?v=3", badge: SITE + "icon-192.png?v=3", dir: "rtl", lang: "he"
          },
          fcmOptions: { link: SITE + "#r=" + encodeURIComponent(name) }
        }
      });
      const stale = [];
      res.responses.forEach((r, j) => {
        const code = r.error && r.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") stale.push(chunk[j]);
      });
      await Promise.all(stale.map((t) => db.collection("subs").doc(owners[t]).set({ tokens: admin.firestore.FieldValue.arrayRemove(t) }, { merge: true })));
    }
  }
  await metaRef.set({ seen: now });
}
/* The Excel sync writes public/health.sync every minute. If it has been quiet for 30 minutes, the managers' phones
   get one notice (and one more when it is back). The workflow also starts the sync again when none is running. */
async function checkSync() {
  const ref = db.collection("public").doc("health");
  const h = (await ref.get()).data() || {};
  const at = h.sync && h.sync.toMillis ? h.sync.toMillis() : 0;
  if (!at) return;
  const down = Date.now() - at > 30 * 60000;
  if (down === !!h.down) return;
  const admins = (await db.collection("admins").get()).docs.map((d) => d.id.toLowerCase());
  const tokens = [];
  for (const a of admins) { const s = await db.collection("subs").doc(a).get(); if (s.exists) (s.data().tokens || []).forEach((t) => tokens.push(t)); }
  const hm = new Date(at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
  const note = down
    ? { title: "הסנכרון עם האקסל נעצר ⚠️", body: "לא פעל מאז " + hm + ". הוא מנסה לחזור לבד; אם זה נמשך, כדאי לבדוק ב-GitHub." }
    : { title: "הסנכרון עם האקסל חזר לעבוד ✅", body: "שינויים בלו״ז ובאקסל עוברים שוב ביניהם." };
  console.log("Sync", down ? "down since " + hm : "back", "· notifying", tokens.length, "devices");
  for (let i = 0; i < tokens.length; i += 500) {
    await admin.messaging().sendEachForMulticast({ tokens: tokens.slice(i, i + 500), webpush: { notification: Object.assign(note, { icon: SITE + "icon-192.png?v=3", badge: SITE + "icon-192.png?v=3", dir: "rtl", lang: "he" }), fcmOptions: { link: SITE } } }).catch((e) => console.log("push failed", e.message));
  }
  await ref.set({ down: down, downNoticeAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}
main().then(checkSync).catch((e) => { console.error(e); process.exit(1); });

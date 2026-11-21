/* One-time setup for "פורום מוביל". Run from GitHub: Actions › "Set up פורום מוביל" › Run workflow.
   1. Renames roles: מרכז -> מרכז צעיר; בוגר -> מרכז בוגר (ליאור), דרג מתנדב (אדוה), מלווה ט (גיא), מדריך שכבה (everyone else).
   2. Copies the existing area bookings (scripts/bookings-import.json) into Firestore, skipping any that already exist.
   With APPLY=false it only prints what it would do. */
const admin = require("firebase-admin");
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.log("FIREBASE_SERVICE_ACCOUNT is not set."); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const APPLY = String(process.env.APPLY) !== "false";
const BY_NAME = { "ליאור": "מרכז בוגר", "אדוה": "דרג מתנדב", "גיא": "מלווה ט׳" };

function newRole(d) {
  if (d.role === "מרכז") return "מרכז צעיר";
  if (d.role !== "בוגר") return null;
  const first = String(d.name || d.fullName || "").trim().split(/\s+/)[0];
  return BY_NAME[first] || "מדריך שכבה";
}
async function roles(col) {
  const snap = await db.collection(col).get();
  const seen = {};
  for (const doc of snap.docs) {
    const d = doc.data(), to = newRole(d);
    if (!to) continue;
    const first = String(d.name || d.fullName || "").trim().split(/\s+/)[0];
    if (BY_NAME[first]) seen[first] = (seen[first] || 0) + 1;
    console.log(`${col}/${doc.id}: ${d.fullName || d.name || ""} | ${d.role} -> ${to}`);
    if (APPLY) await doc.ref.set({ role: to }, { merge: true });
  }
  Object.keys(seen).forEach((n) => { if (seen[n] > 1) console.log(`WARNING: ${seen[n]} alumni named ${n} in ${col}; all of them got "${BY_NAME[n]}".`); });
}
async function bookings() {
  const data = require("./bookings-import.json");
  let added = 0;
  for (const id of Object.keys(data)) {
    const ref = db.collection("bookings").doc(id);
    if ((await ref.get()).exists) continue;
    added++;
    if (APPLY) await ref.set(Object.assign({}, data[id], { at: admin.firestore.FieldValue.serverTimestamp() }));
  }
  console.log(`Bookings: ${added} new of ${Object.keys(data).length}.`);
}
(async () => {
  await roles("users");
  await roles("pending");
  await bookings();
  console.log(APPLY ? "Done." : "Nothing written (APPLY=false).");
})().catch((e) => { console.error(e); process.exit(1); });

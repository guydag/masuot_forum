/* Receives push notifications while the site is closed. FCM shows the notification itself;
   this file also makes tapping it open the site. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyABd26IEKadfnCKTyVezfD4upQOLu8XxNE",
  authDomain: "mishuot.firebaseapp.com",
  projectId: "mishuot",
  storageBucket: "mishuot.firebasestorage.app",
  messagingSenderId: "771775436102",
  appId: "1:771775436102:web:e1c8ef6a1cea1b95fdc147"
});
/* Registered before the Firebase SDK's own click handler, so this one decides where a tap goes:
   an open window is focused and told which report to show, otherwise a new window opens on it. */
self.addEventListener("notificationclick", function (event) {
  var d = event.notification.data || {}, m = d.FCM_MSG || {};
  var url = (m.fcmOptions && m.fcmOptions.link) || (m.notification && m.notification.click_action) || d.url || self.registration.scope;
  event.notification.close();
  event.stopImmediatePropagation();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) {
        try { list[i].postMessage({ openReport: url }); } catch (e) {}
        return list[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});

/* Offline: the site's own files and the libraries it loads are kept as they come in (network first),
   so with no connection the app still opens; the data itself comes from Firestore's own cache on the device. */
var OFF_CACHE = "forum-offline-v1";
var OFF_HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var mine = url.origin === self.location.origin && url.pathname.indexOf(new URL(self.registration.scope).pathname) === 0;
  if (!mine && OFF_HOSTS.indexOf(url.hostname) === -1) return;
  if (mine && /firebase-messaging-sw\.js$/.test(url.pathname)) return;
  event.respondWith(fetch(req).then(function (res) {
    if (res && (res.ok || res.type === "opaque")) { var copy = res.clone(); caches.open(OFF_CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.open(OFF_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        /* A page or file asked for with a different ?v= or #: fall back to the same path. */
        return c.match(req, { ignoreSearch: true }).then(function (h2) {
          if (h2) return h2;
          if (req.mode === "navigate") return c.match(new URL("index.html", self.registration.scope).href, { ignoreSearch: true });
          return Response.error();
        });
      });
    });
  }));
});

firebase.messaging();

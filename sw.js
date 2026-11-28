const CACHE = "circle-v59";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "reels.js", "reels.css", "calls.js"])));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});

/* v30: Web Push. Shows a notification when a message or call arrives and the app is not open. */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === "visible")) return; /* app is on screen: in-app tone/ring handles it */
    const call = d.kind === "call";
    await self.registration.showNotification(d.title || "Circle", {
      body: d.body || "",
      tag: d.tag || "circle",
      icon: "icon-192.png",
      badge: "icon-192.png",
      vibrate: call ? [400, 200, 400, 200, 400] : [150, 80, 150],
      renotify: true,
      requireInteraction: call,
      data: { url: d.url || "./" }
    });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) return w.focus(); }
    return self.clients.openWindow(url);
  })());
});

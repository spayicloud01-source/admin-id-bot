// Admin ID PWA launcher. Always use the live network for authenticated pages.
// Never cache customer records, LINE identifiers, private links, or API responses.
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate" && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request));
  }
});

const APP_CACHE = "tanca-plus-shell-v2";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest?v=7",
  "/favicon.ico?v=7",
  "/icon-192.png?v=7",
  "/icon-512.png?v=7",
  "/apple-touch-icon.png?v=7"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== APP_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches
          .open(APP_CACHE)
          .then((cache) => cache.put(event.request, responseClone))
          .catch(() => undefined);
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        return caches.match("/");
      })
  );
});

const CACHE_NAME = "emdr-companion-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/drive.js",
  "./js/skills.js",
  "./js/safeplace.js",
  "./js/summary.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Only cache-first the app shell itself. Never intercept Google API / Drive
// requests, so notes and media always come fresh from the network.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellRequest = url.origin === self.location.origin;

  if (!isShellRequest) return; // let Drive/Google requests pass straight through

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        }).catch(() => cached)
      );
    })
  );
});

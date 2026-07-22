const CACHE_NAME = "emdr-companion-shell-v2";
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

// Network-first for the app shell: always try to get the latest code first,
// and only fall back to the cached copy if the network request fails (i.e.
// offline). This means updates you deploy actually reach the phone, and the
// cache exists purely for offline use, not as the default source of truth.
// Google API / Drive requests are never intercepted.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellRequest = url.origin === self.location.origin;

  if (!isShellRequest) return; // let Drive/Google requests pass straight through

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

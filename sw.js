// Anrede — app-shell cache.
// v2: network-first for anything that can change (HTML/manifest), so a
// Vercel deploy reaches already-installed users on next load even if
// sw.js's own bytes didn't change. Cache-first only for icons, which are
// immutable once shipped. Bump CACHE_NAME on breaking changes to force
// a clean cutover.
const CACHE_NAME = "anrede-shell-v2";
const IMMUTABLE_FILES = [
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];
const NETWORK_FIRST_FILES = ["./index.html", "./manifest.json", "./"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(IMMUTABLE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isNetworkFirst(url) {
  return NETWORK_FIRST_FILES.some((f) => url.pathname.endsWith(f.replace("./", "/")) || url.pathname === "/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // never intercept CDN/model traffic
  if (event.request.method !== "GET") return;

  if (isNetworkFirst(url)) {
    // Network-first: always try to get the latest shell; fall back to
    // cache only when actually offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for immutable assets.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

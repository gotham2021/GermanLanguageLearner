// Anrede — app-shell cache.
// v3: added the six local persona-portrait SVGs (avatars/) introduced by
// the Sprachfreund visual redesign; CACHE_NAME bumped per the "Important
// for future updates" section of README.md so installed users actually
// pick up this change instead of running the old v2 worker forever.
// Cache-first only for icons/avatars, which are immutable once shipped.
// Network-first for anything that can change (HTML/manifest).
//
// v3 also hardens install: v2 used cache.addAll(), which rejects the
// *entire* install step if even one listed file 404s — meaning a single
// missing icon silently prevented the service worker from ever installing
// (caught by index.html's empty catch). We now cache each file
// independently via allSettled, so one missing asset can't take down the
// whole offline shell.
const CACHE_NAME = "anrede-shell-v3";
const IMMUTABLE_FILES = [
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "./avatars/hoffmann.svg",
  "./avatars/bauer.svg",
  "./avatars/keller.svg",
  "./avatars/max.svg",
  "./avatars/lea.svg",
  "./avatars/jonas.svg"
];
const NETWORK_FIRST_FILES = ["./index.html", "./manifest.json", "./"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        IMMUTABLE_FILES.map((f) =>
          cache.add(f).catch((err) => console.warn("sw: failed to precache", f, err))
        )
      )
    )
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

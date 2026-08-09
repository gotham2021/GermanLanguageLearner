// Anrede — app-shell cache.
// v2: network-first for anything that can change (HTML/manifest), so a
// Vercel deploy reaches already-installed users on next load even if
// sw.js's own bytes didn't change. Cache-first only for icons, which are
// immutable once shipped. Bump CACHE_NAME on breaking changes to force
// a clean cutover.
// v3: precache each immutable file independently (see install handler
// below) instead of via a single cache.addAll(). addAll() rejects the
// whole install if even one listed file 404s — which is exactly what was
// happening, because the icon files below weren't actually present in
// the deployed folder, so the service worker never installed at all and
// none of this offline logic ever ran. Bumping CACHE_NAME so already-
// affected clients (none currently, since install never succeeded, but
// as a matter of habit) pick this up cleanly.
// v4: index.html now ships CEFR levels, goal-directed scenarios, and
// IndexedDB persistence — bumping so installed clients pick up the new
// shell on next network-first fetch of index.html.
// v5: switched the on-device model to Llama-3.2-1B-Instruct, moved
// grammar/register correction into its own isolated model call, and
// made the UI chrome bilingual (English default, German toggle) while
// keeping all German-learning content in German. Bumping so installed
// clients notice the update.
const CACHE_NAME = "anrede-shell-v5";
const IMMUTABLE_FILES = [
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];
const NETWORK_FIRST_FILES = ["./index.html", "./manifest.json", "./"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Precache each file independently so one missing/renamed icon
      // can't take down installation of the whole app shell — see the
      // v3 note above for why this matters here specifically.
      Promise.all(
        IMMUTABLE_FILES.map((file) =>
          cache.add(file).catch((err) => {
            console.error("[sw] precache failed for", file, err);
          })
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

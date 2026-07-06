// ============================================================
// LeleFlix Service Worker
// Strategia:
//  - App shell (HTML/CSS/JS same-origin) → NETWORK-FIRST con bypass
//    della cache HTTP (cache:'reload'): ogni deploy si vede SUBITO
//    quando sei online; la cache è solo fallback offline.
//  - Immagini TMDB → CACHE-FIRST (veloci, non cambiano).
//  - API JSON → NETWORK-ONLY (dati sempre freschi).
// Bumpare CACHE_NAME NON è più necessario per vedere le modifiche,
// serve solo a svuotare la vecchia cache una volta.
// ============================================================
const CACHE_NAME = "leleflix-v10";
const IMAGE_CACHE_NAME = "leleflix-images-v7";

// Precache minimo per il funzionamento OFFLINE (fallback).
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/ios26.css",
  "./liquid-glass.js",
  "./js/player.js",
  "./icon-192.png",
  "./icon-512.png",
  "./logo.png"
];

// 1. INSTALLAZIONE
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // cache:'reload' → forza il download fresco dei file in precache
      cache.addAll(urlsToCache.map(u => new Request(u, { cache: "reload" })))
    )
  );
});

// 2. ATTIVAZIONE — pulizia delle cache vecchie
self.addEventListener("activate", event => {
  const whitelist = [CACHE_NAME, IMAGE_CACHE_NAME];
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => whitelist.indexOf(n) === -1)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// 3. FETCH
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return; // POST/PUT (progress, log…) sempre alla rete
  const url = new URL(req.url);

  // 1) Immagini TMDB → cache-first
  if (url.hostname.includes("image.tmdb.org")) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache =>
        cache.match(req).then(hit =>
          hit || fetch(req).then(res => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  // 2) API → network-only (mai cache)
  if (url.pathname.includes("/api/") || url.search.includes("api_key")) {
    event.respondWith(fetch(req));
    return;
  }

  // 3) App shell same-origin (navigazioni + .html/.css/.js) → NETWORK-FIRST
  const isShell = url.origin === self.location.origin && (
    req.mode === "navigate" ||
    /\.(?:html|css|js)$/.test(url.pathname) ||
    url.pathname.endsWith("/")
  );
  if (isShell) {
    event.respondWith(
      // cache:'reload' → bypassa anche la cache HTTP del browser/CDN
      fetch(req, { cache: "reload" })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // 4) Tutto il resto (CDN esterni, ecc.) → cache-first con fallback rete
  event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

// Aumenta la versione per forzare l'aggiornamento
const CACHE_NAME = "leleflix-v7"; // Aggiornato a v7
const IMAGE_CACHE_NAME = "leleflix-images-v3"; // Nuova cache specifica per le immagini

const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/player.js", 
  "./icon-192.png",
  "./icon-512.png",
  "./logo.png"
];

// 1. INSTALLAZIONE
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened static cache');
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. ATTIVAZIONE (Gestione pulizia cache)
self.addEventListener("activate", event => {
  // Manteniamo sia la cache dell'app che quella delle immagini
  const cacheWhitelist = [CACHE_NAME, IMAGE_CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. FETCH (Gestione Intelligente)
self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);

  // A. STRATEGIA: Cache First per le IMMAGINI di TMDB
  // Se l'URL contiene 'image.tmdb.org', lo salviamo nella cache immagini
  if (requestUrl.hostname.includes('image.tmdb.org')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // 1. Se è in cache, restituiscilo subito (Velocissimo!)
          if (response) {
            return response;
          }
          // 2. Se non c'è, scaricalo dalla rete
          return fetch(event.request).then(networkResponse => {
            // Controlla che la risposta sia valida prima di cacharla
            if(networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return; // Stop qui per le immagini
  }

  // B. STRATEGIA: Network Only per le API JSON
  // Le chiamate dati (titoli, descrizioni, ecc.) non devono essere cachate
  if (requestUrl.pathname.includes('/3/') || event.request.url.includes('api.')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // C. STRATEGIA: Cache First per i file statici dell'app (CSS, JS, HTML)
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});
// Aumenta la versione per forzare l'aggiornamento
const CACHE_NAME = "leleflix-v20"; // Aggiornato a v7
const IMAGE_CACHE_NAME = "leleflix-images-v8"; // Nuova cache specifica per le immagini

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
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // 1. GESTIONE IMMAGINI TMDB (Salvale in cache!)
  if (requestUrl.hostname.includes('image.tmdb.org')) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // Se l'immagine è già nella cache del browser, usala subito
          if (response) return response;
          
          // Altrimenti scaricala da TMDB e salvala per la prossima volta
          return fetch(event.request).then(networkResponse => {
            if(networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 2. GESTIONE API (Non cachare mai le API JSON per avere dati freschi)
  if (requestUrl.pathname.includes('/api/') || requestUrl.search.includes('api_key')) {
     event.respondWith(fetch(event.request));
     return;
  }

  // 3. GESTIONE FILE STATICI APP (HTML, CSS, JS)
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

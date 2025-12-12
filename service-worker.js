// Aumenta la versione (es. v2) per forzare l'aggiornamento sui dispositivi
const CACHE_NAME = "leleflix-v6";

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

// 1. INSTALLAZIONE: Cacha i file statici
self.addEventListener("install", event => {
  // Forza il service worker a diventare attivo subito
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. ATTIVAZIONE: Pulisci la vecchia cache (Fondamentale!)
self.addEventListener("activate", event => {
  const cacheWhitelist = [CACHE_NAME];
  
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
  // Prende il controllo di tutti i client aperti immediatamente
  return self.clients.claim();
});

// 3. FETCH: Gestione richieste
self.addEventListener("fetch", event => {
  // STRATEGIA: Network Only per le API (non cachare mai le risposte API)
  if (event.request.url.includes('api.') || event.request.url.includes('themoviedb.org')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // STRATEGIA: Cache First, falling back to Network per i file statici
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response; // Trovato in cache
      }
      return fetch(event.request).then(networkResponse => {
        // Opzionale: potresti voler cachare dinamicamente nuove risorse qui
        return networkResponse;
      });
    })
  );
});
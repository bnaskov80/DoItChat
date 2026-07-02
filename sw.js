const CACHE_NAME = 'doitchat-cache-v4'; // NYTT: Öka versionen för att reflektera ändrad start_url.
// Lista med filer som ska cachas. Lägg till alla viktiga resurser här.
const urlsToCache = [
  '.', // Använd relativa sökvägar för att fungera oavsett var appen hostas.
  'index.html',
  'login.html',
  'style.css',
  'login.css',
  'js/app.js',
  'js/state.js',
  'js/ui.js',
  'js/events.js',
  'icons.svg',
  // NYTT: Lägg till ikoner och ljud så att de också fungerar offline.
  'images/icon-192.png',
  'images/icon-512.png',
  'sounds/notification.mp3'
];

// Installera service workern och cacha appens skal
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell för version', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
  );
});

// NYTT: Aktivera service workern och rensa gamla cache-versioner.
// Detta är kritiskt för att säkerställa att appen uppdateras när du ändrar koden.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          // Ta bort alla cache-filer som inte matchar den nuvarande versionen.
          return cacheName.startsWith('doitchat-cache-') && cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('Service Worker: Raderar gammal cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
});

// Svara på fetch-requests med en "Network falling back to cache"-strategi.
self.addEventListener('fetch', event => {
  // Ignorera requests till Firebase, de har sin egen offline-hantering.
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    // 1. Försök hämta från nätverket först.
    fetch(event.request).catch(() => {
      // 2. Om nätverket misslyckas (t.ex. offline), hämta från cachen.
      return caches.match(event.request);
    })
  );
});
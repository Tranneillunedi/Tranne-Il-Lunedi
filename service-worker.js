const CACHE_NAME = 'tranne-il-lunedi-v21';
const APP_FILES = [
  './',
  './index.html',
  './style.css?v=21',
  './app.js?v=21',
  './supabase-config.js',
  './onesignal.js?v=21',
  './manifest.json',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // I file OneSignal devono arrivare direttamente dalla rete.
  // Il service worker della PWA non deve intercettarli né memorizzarli.
  if (
    url.pathname.includes('/onesignal/') ||
    url.hostname === 'cdn.onesignal.com'
  ) {
    return;
  }

  // Non memorizzare risorse appartenenti ad altri domini.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        throw new Error('Risorsa non disponibile offline.');
      })
  );
});

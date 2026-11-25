var CACHE = 'stomper-shell-v2';
var API_ORIGIN = 'https://yzyipxvlsoxfphwobfkb.supabase.co';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/jpLogo-white-rotated-2000.png',
  './assets/css/brief-message.css',
  './assets/js/config/api.js',
  './assets/js/utils/brief-message.js',
  './assets/js/utils/music.js',
  './assets/js/utils/lyrics.js',
  './assets/js/components/chord-diagram.js',
  './assets/js/components/chord-strip.js',
  './assets/js/components/account.js',
  './assets/js/pages/player.js',
  './main.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(SHELL);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) {
      return caches.delete(key);
    }));
  }));
  self.clients.claim();
});

// Network-first for the app shell and the song library API (Supabase); cache is the offline fallback,
// so songs opened before stay playable offline. Other origins (YouTube, LRCLIB) are left alone.
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  var isApi = url.origin === API_ORIGIN && url.pathname.indexOf('/functions/v1/stomper-api') === 0;
  if (url.origin !== self.location.origin && !isApi) return;
  event.respondWith(fetch(event.request).then(function (response) {
    if (response.ok) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
    }
    return response;
  }).catch(function () {
    // The API's query string picks the song, so it must match exactly; the shell can ignore it.
    return caches.match(event.request, { ignoreSearch: !isApi });
  }));
});

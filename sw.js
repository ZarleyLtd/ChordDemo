var CACHE = 'chorddemo-shell-v2';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './songs/index.json',
  './assets/css/style.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/css/brief-message.css',
  './assets/js/utils/brief-message.js',
  './assets/js/utils/music.js',
  './assets/js/utils/lyrics.js',
  './assets/js/components/chord-diagram.js',
  './assets/js/components/chord-strip.js',
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

// Network-first for same-origin GETs (app shell and song files); cache is the offline fallback.
// Other origins (YouTube, LRCLIB) are left alone.
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
    return response;
  }).catch(function () {
    return caches.match(event.request, { ignoreSearch: true });
  }));
});

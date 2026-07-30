/* ==========================================================================
   سرویس‌ورکر — کارکرد آفلاین
   صفحه‌ها از شبکه گرفته می‌شوند تا نسخه تازه دیده شود و اگر اینترنت نبود از
   حافظه می‌آیند. فایل‌های ثابت از حافظه می‌آیند و در پس‌زمینه به‌روز می‌شوند.
   ========================================================================== */

var VERSION = 'v6';
var CACHE = 'faktor-' + VERSION;

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/jalali.js',
  './assets/js/persian.js',
  './assets/js/app.js',
  './assets/js/export.js',
  './assets/js/pwa.js',
  './assets/img/logo.svg',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/fonts/Vazirmatn-Regular.woff2',
  './assets/fonts/Vazirmatn-Medium.woff2',
  './assets/fonts/Vazirmatn-SemiBold.woff2',
  './assets/fonts/Vazirmatn-Bold.woff2',
  './assets/fonts/Vazirmatn-ExtraBold.woff2'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  /* درخواست خودِ صفحه: اول شبکه تا نسخه تازه بیاید */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put('./index.html', copy); });
          return response;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (cached) {
            return cached || caches.match('./');
          });
        })
    );
    return;
  }

  /* بقیه فایل‌ها: از حافظه، با به‌روزرسانی در پس‌زمینه */
  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () { return cached; });

      return cached || network;
    })
  );
});

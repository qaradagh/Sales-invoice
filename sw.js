/* ==========================================================================
   سرویس‌ورکر — کارکرد آفلاین
   صفحه‌ها از شبکه گرفته می‌شوند تا نسخه تازه دیده شود و اگر اینترنت نبود از
   حافظه می‌آیند. فایل‌های ثابت از حافظه می‌آیند و در پس‌زمینه به‌روز می‌شوند.
   ========================================================================== */

var VERSION = 'v7.2.0';
var CACHE_PREFIX = 'sales-invoice-main-' + self.registration.scope + '-';
var CACHE = CACHE_PREFIX + VERSION;

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css?v=7.2.0',
  './assets/js/jalali.js',
  './assets/js/persian.js',
  './assets/js/quick-entry.js?v=7.2.0',
  './assets/js/app.js?v=7.2.0',
  './assets/js/export.js?v=7.2.0',
  './assets/js/pwa.js?v=7.2.0',
  './assets/js/ui.js?v=7.2.0',
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
      .then(function (cache) {
        return cache.addAll(SHELL.map(function (url) {
          return new Request(new URL(url, self.registration.scope).href, { cache: 'reload' });
        }));
      })
  );
});

self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'VERSION', version: VERSION });
  }
  if (event.data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE ? caches.delete(key) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  /* صفحه و کد: اول شبکه؛ حتی پیوند قدیمی با ?v= قبلی به نسخه تازه برسد. */
  var pathname = new URL(request.url).pathname;
  var code = /\/assets\/(?:js\/[^/]+\.js|css\/[^/]+\.css)$/.test(pathname);
  if (request.mode === 'navigate' || code) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (!response || !response.ok) throw new Error('نسخه شبکه در دسترس نیست');
          var copy = response.clone();
          return caches.open(CACHE).then(function (cache) {
            return cache.put(request.mode === 'navigate' ? './index.html' : request, copy);
          }).catch(function () { /* پاسخ سالم شبکه همچنان قابل استفاده است */ }).then(function () { return response; });
        })
        .catch(function () {
          if (code) return caches.open(CACHE).then(function (cache) {
            return cache.match(request).then(function (cached) {
              if (cached) return cached;
              // کش همین انتشار می‌تواند کد آفلاین یک نشانی با نسخه قدیمی را تامین کند.
              return cache.match(request, { ignoreSearch: true });
            });
          });
          return caches.open(CACHE).then(function (cache) { return cache.match('./index.html'); }).then(function (cached) {
            return cached || caches.open(CACHE).then(function (cache) { return cache.match('./'); });
          });
        })
    );
    return;
  }

  /* بقیه فایل‌ها: از حافظه، با به‌روزرسانی در پس‌زمینه */
  event.respondWith(
    caches.open(CACHE).then(function (cache) { return cache.match(request); }).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          return caches.open(CACHE).then(function (cache) { return cache.put(request, copy); })
            .catch(function () { /* پر بودن حافظه نباید دریافت شبکه را خراب کند */ })
            .then(function () { return response; });
        }
        return response;
      }).catch(function () { return cached; });

      event.waitUntil(network.then(function () {}));
      return cached || network;
    })
  );
});

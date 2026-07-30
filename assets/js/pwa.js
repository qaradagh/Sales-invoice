/* ==========================================================================
   نصب روی دستگاه و کارکرد آفلاین
   ========================================================================== */
(function () {
  'use strict';

  /* ───────────────── ثبت سرویس‌ورکر ───────────────── */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (registration) {
        /* هر بار که برنامه باز می‌شود، نسخه تازه بررسی می‌شود */
        registration.update();
      }).catch(function (error) {
        console.warn('ثبت سرویس‌ورکر ناموفق بود:', error);
      });
    });

    /* وقتی سرویس‌ورکر تازه فعال شد، صفحه یک‌بار نوسازی می‌شود تا
       نسخه جدید بدون بستن برنامه بالا بیاید */
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }

  /* ───────────────── دکمه نصب ───────────────── */

  var button = document.getElementById('btnInstall');
  var prompt = null;

  if (!button) return;

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    prompt = event;
    button.hidden = false;
  });

  button.addEventListener('click', function () {
    if (!prompt) return;
    prompt.prompt();
    prompt.userChoice.then(function () {
      prompt = null;
      button.hidden = true;
    });
  });

  window.addEventListener('appinstalled', function () {
    prompt = null;
    button.hidden = true;
  });
})();

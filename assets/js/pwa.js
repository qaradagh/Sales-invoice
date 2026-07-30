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

  /* ───────────────── تشخیص مرورگر و وضعیت نصب ───────────────── */

  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var isFirefox = /Firefox|FxiOS/.test(ua);

  function currentBrowser() {
    if (isIOS) return 'ios';
    if (isFirefox && isAndroid) return 'firefox';
    if (isAndroid) return 'android';
    return 'desktop';
  }

  /** آیا برنامه همین حالا به‌صورت نصب‌شده باز شده است؟ */
  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      navigator.standalone === true;
  }

  /* ───────────────── پنجره راهنمای نصب ───────────────── */

  var button = document.getElementById('btnInstall');
  var modal = document.getElementById('installModal');
  var installNow = document.getElementById('btnInstallNow');
  var hint = document.getElementById('installHint');
  var deferredPrompt = null;
  var lastFocused = null;

  if (!button || !modal) return;

  /* اگر برنامه نصب شده باشد، دکمه اصلاً لازم نیست */
  if (isInstalled()) button.hidden = true;

  function markCurrentBrowser() {
    var current = currentBrowser();
    var items = modal.querySelectorAll('.guide__item');
    Array.prototype.forEach.call(items, function (item) {
      item.classList.toggle('is-current', item.dataset.browser === current);
    });
  }

  function openModal() {
    lastFocused = document.activeElement;
    markCurrentBrowser();

    installNow.hidden = !deferredPrompt;
    hint.textContent = deferredPrompt
      ? 'یا به‌صورت دستی:'
      : 'راه نصب در مرورگر شما:';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    (deferredPrompt ? installNow : modal.querySelector('.modal__close')).focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  button.addEventListener('click', openModal);

  modal.addEventListener('click', function (event) {
    if (event.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  installNow.addEventListener('click', function () {
    if (!deferredPrompt) return;
    var prompt = deferredPrompt;
    deferredPrompt = null;
    installNow.hidden = true;
    closeModal();
    prompt.prompt();
  });

  /* ───────────────── رویدادهای مرورگر ───────────────── */

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    button.hidden = true;
    if (!modal.hidden) closeModal();
  });
})();

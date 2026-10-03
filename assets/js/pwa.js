/* ==========================================================================
   نصب روی دستگاه و کارکرد آفلاین
   ========================================================================== */
(function () {
  'use strict';

  /* ───────────────── اطلاع از نسخه تازه و به‌روزرسانی اختیاری ───────────────── */

  var APP_VERSION = '7.2.0';
  var SEEN_VERSION_KEY = 'shilan-invoice-app-version';
  var DISMISSED_VERSION_KEY = 'shilan-invoice-update-dismissed-version';
  var QUICK_DRAFT_KEY = 'shilan-invoice-update-quick-draft';
  var APPLIED_VERSION_KEY = 'shilan-invoice-update-applied-version';
  var shownVersions = {};
  var suppressedVersions = {};
  var notice = null;
  var noticeState = null;
  var refreshing = false;
  var requestedUpdate = false;
  var requestedVersion = '';
  var updateTimer = null;
  var registrationRef = null;
  var lastCheck = 0;

  function stored(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* اعلان در همین نشست کار می‌کند */ }
  }
  function version(value) {
    var text = String(value || '').replace(/^v/, '');
    return /^\d+\.\d+\.\d+$/.test(text) ? text : '';
  }
  function newer(a, b) {
    if (!version(a) || !version(b)) return false;
    var left = a.split('.').map(Number), right = b.split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if (left[i] !== right[i]) return left[i] > right[i];
    }
    return false;
  }
  function displayVersion(value) {
    return globalDigits(value);
  }
  function globalDigits(value) {
    return window.Fa && typeof window.Fa.toFaDigits === 'function' ? window.Fa.toFaDigits(value) : value;
  }
  function suppressed(target) {
    return suppressedVersions[target] || stored(DISMISSED_VERSION_KEY) === target;
  }
  function rememberChoice() {
    if (!noticeState || !notice) return;
    var target = noticeState.version;
    var checked = document.getElementById('updateNoticeSuppress').checked;
    suppressedVersions[target] = checked;
    if (checked) remember(DISMISSED_VERSION_KEY, target);
    else if (stored(DISMISSED_VERSION_KEY) === target) {
      try { localStorage.removeItem(DISMISSED_VERSION_KEY); } catch (e) { /* اختیاری */ }
    }
  }
  function closeNotice() {
    rememberChoice();
    if (notice) notice.hidden = true;
  }
  function acknowledgeUrl(target) {
    try {
      var url = new URL(location.href);
      var previous = version(url.searchParams.get('v'));
      if (previous && newer(target, previous)) {
        url.searchParams.set('v', target);
        window.history.replaceState(window.history.state, '', url.href);
      }
    } catch (e) { /* تغییر نشانی فقط برای جلوگیری از اعلان تکراری پیوند قدیمی است */ }
  }
  function createNotice() {
    notice = document.createElement('section');
    notice.id = 'updateNotice';
    notice.className = 'update-notice no-print';
    notice.setAttribute('role', 'region');
    notice.setAttribute('aria-labelledby', 'updateNoticeTitle');
    // هیچ داده خارجی در این نشانه‌گذاری قرار نمی‌گیرد؛ نسخه با textContent نمایش داده می‌شود.
    notice.innerHTML = '<h2 id="updateNoticeTitle" class="update-notice__title"></h2>' +
      '<p id="updateNoticeMessage" class="update-notice__message" aria-live="polite"></p>' +
      '<label class="update-notice__suppress"><input id="updateNoticeSuppress" type="checkbox">' +
      '<span>دیگر این پیام را نمایش نده</span></label>' +
      '<div class="update-notice__actions"><button id="btnApplyUpdate" class="btn btn--primary" type="button"></button>' +
      '<button id="btnDismissUpdate" class="btn btn--ghost" type="button">بعدا</button></div>';
    document.body.appendChild(notice);
    document.getElementById('updateNoticeSuppress').addEventListener('change', rememberChoice);
    document.getElementById('btnDismissUpdate').addEventListener('click', closeNotice);
    document.getElementById('btnApplyUpdate').addEventListener('click', applyUpdate);
  }
  function renderNotice() {
    var loaded = noticeState.mode === 'loaded';
    document.getElementById('updateNoticeTitle').textContent = loaded ? 'نسخه تازه برنامه آماده است' : 'نسخه جدید در دسترس است';
    document.getElementById('updateNoticeMessage').textContent = loaded
      ? 'برنامه اکنون با نسخه ' + displayVersion(noticeState.version) + ' باز شده است.'
      : 'نسخه ' + displayVersion(noticeState.version) + ' آماده است. پیش از نوسازی، فاکتور جاری ذخیره می‌شود.';
    var action = document.getElementById('btnApplyUpdate');
    action.textContent = loaded ? 'ادامه' : 'به‌روزرسانی';
    action.disabled = false;
    notice.hidden = false;
  }
  function showNotice(target, worker, mode) {
    target = version(target);
    if (!target || newer(APP_VERSION, target)) return;
    if (noticeState && noticeState.version === target && notice && !notice.hidden) {
      if ((mode !== 'loaded' && noticeState.mode === 'loaded') || (mode === 'active' && noticeState.mode === 'waiting')) {
        noticeState = { version: target, worker: worker, mode: mode };
        renderNotice();
      }
      return;
    }
    if (suppressed(target) || shownVersions[target]) return;
    shownVersions[target] = true;
    if (!notice) createNotice();
    noticeState = { version: target, worker: worker, mode: mode };
    document.getElementById('updateNoticeSuppress').checked = false;
    renderNotice();
  }
  function workerVersion(worker) {
    return new Promise(function (resolve) {
      if (!worker || typeof MessageChannel === 'undefined') { resolve(''); return; }
      var channel = new MessageChannel();
      var done = false;
      var timeout = setTimeout(function () { finish(''); }, 2500);
      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        channel.port1.close();
        channel.port2.close();
        resolve(version(value));
      }
      channel.port1.onmessage = function (event) {
        finish(event.data && event.data.type === 'VERSION' ? event.data.version : '');
      };
      try { worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]); }
      catch (e) { finish(''); }
    });
  }
  function checkWaiting(registration) {
    var waiting = registration && registration.waiting;
    if (!waiting) return Promise.resolve();
    return workerVersion(waiting).then(function (target) {
      // پاسخ نسخه باید متعلق به همان ورکر منتظر باشد، نه نسخه در حال اجرای صفحه.
      if (registration.waiting === waiting && waiting.state !== 'redundant') showNotice(target, waiting, 'waiting');
    });
  }
  function saveBeforeUpdate() {
    try {
      if (!window.Invoice || typeof window.Invoice.flushSave !== 'function' || !window.Invoice.flushSave()) return false;
      var quick = document.getElementById('quickEntryText');
      if (quick && quick.value) sessionStorage.setItem(QUICK_DRAFT_KEY, quick.value);
      else sessionStorage.removeItem(QUICK_DRAFT_KEY);
      return true;
    } catch (e) { return false; }
  }
  function updateFailed(message) {
    requestedUpdate = false;
    clearTimeout(updateTimer);
    if (!notice) return;
    notice.hidden = false;
    document.getElementById('btnApplyUpdate').disabled = false;
    document.getElementById('updateNoticeMessage').textContent = message;
  }
  function reloadSaved() {
    if (refreshing) return;
    if (!saveBeforeUpdate()) {
      updateFailed('ذخیره فاکتور کامل نشد. ابتدا از منوی فایل، فایل فاکتور را ذخیره کنید؛ صفحه نوسازی نشد.');
      return;
    }
    try { sessionStorage.setItem(APPLIED_VERSION_KEY, requestedVersion); } catch (e) { /* فقط جلوگیری از اعلان دوباره */ }
    acknowledgeUrl(requestedVersion);
    clearTimeout(updateTimer);
    refreshing = true;
    location.reload();
  }
  function applyUpdate() {
    if (!noticeState || refreshing || requestedUpdate) return;
    if (noticeState.mode === 'loaded') { acknowledgeUrl(noticeState.version); closeNotice(); return; }
    if (!saveBeforeUpdate()) {
      updateFailed('ذخیره فاکتور کامل نشد. ابتدا از منوی فایل، فایل فاکتور را ذخیره کنید؛ صفحه نوسازی نشد.');
      return;
    }
    rememberChoice();
    requestedVersion = noticeState.version;
    if (noticeState.mode === 'active') { reloadSaved(); return; }
    var waiting = registrationRef && registrationRef.waiting;
    if (!waiting || waiting !== noticeState.worker || waiting.state === 'redundant') {
      updateFailed('وضعیت نسخه تازه تغییر کرده است. دوباره بررسی می‌شود؛ کمی بعد تلاش کنید.');
      checkWaiting(registrationRef);
      return;
    }
    requestedUpdate = true;
    document.getElementById('btnApplyUpdate').disabled = true;
    document.getElementById('updateNoticeMessage').textContent = 'در حال آماده‌کردن نسخه تازه…';
    updateTimer = setTimeout(function () {
      updateFailed('به‌روزرسانی هنوز کامل نشده است. فاکتور شما باز مانده؛ دوباره تلاش کنید.');
    }, 10000);
    try { waiting.postMessage({ type: 'SKIP_WAITING' }); }
    catch (e) { updateFailed('شروع به‌روزرسانی ممکن نشد. دوباره تلاش کنید.'); }
  }
  function checkForUpdates(force) {
    if (!registrationRef) return;
    checkWaiting(registrationRef);
    if (!force && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    if (navigator.onLine === false) return;
    registrationRef.update().then(function () { checkWaiting(registrationRef); }).catch(function () { /* آفلاین: نسخه موجود حفظ می‌شود */ });
  }
  function startUpdates() {
    var label = document.getElementById('appVersion');
    if (label) label.textContent = 'نسخه ' + displayVersion(APP_VERSION);
    var prior = version(stored(SEEN_VERSION_KEY));
    var requested = '';
    var justApplied = '';
    try { requested = version(new URL(location.href).searchParams.get('v')); } catch (e) { /* بدون نشانی معتبر */ }
    try {
      justApplied = sessionStorage.getItem(APPLIED_VERSION_KEY) || '';
      sessionStorage.removeItem(APPLIED_VERSION_KEY);
      var quickDraft = sessionStorage.getItem(QUICK_DRAFT_KEY);
      var quick = document.getElementById('quickEntryText');
      if (quickDraft && quick) { quick.value = quickDraft; sessionStorage.removeItem(QUICK_DRAFT_KEY); }
    } catch (e) { /* ذخیره نشست اختیاری است */ }
    if (justApplied !== APP_VERSION && (newer(APP_VERSION, prior) || newer(APP_VERSION, requested))) showNotice(APP_VERSION, null, 'loaded');
    // اگر یک برگه قدیمی هنوز باز است، شماره نسخه جدیدتر را به عقب برنگردانید.
    if (!prior || !newer(prior, APP_VERSION)) remember(SEEN_VERSION_KEY, APP_VERSION);

    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (registration) {
      registrationRef = registration;
      function watchInstalling() {
        var installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', function () {
          if (installing.state === 'installed') checkWaiting(registration);
        });
      }
      registration.addEventListener('updatefound', watchInstalling);
      watchInstalling();
      checkForUpdates(true);
    }).catch(function (error) { console.warn('ثبت سرویس‌ورکر ناموفق بود:', error); });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (requestedUpdate) { reloadSaved(); return; }
      // فعال‌سازی در برگه دیگر یا نخستین نصب نباید پیش‌نویس این برگه را ببندد.
      workerVersion(navigator.serviceWorker.controller).then(function (target) {
        if (newer(target, APP_VERSION)) showNotice(target, null, 'active');
      });
    });
    window.addEventListener('focus', function () { checkForUpdates(false); });
    window.addEventListener('online', function () { checkForUpdates(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkForUpdates(false);
    });
  }
  if (document.readyState === 'complete') startUpdates();
  else window.addEventListener('load', startUpdates);

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

  /* اگر برنامه نصب شده باشد، دکمه اصلا لازم نیست */
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
    if (lastFocused && !lastFocused.closest('details:not([open])') && lastFocused.getClientRects().length) lastFocused.focus();
    else document.getElementById('tab-settings').focus();
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

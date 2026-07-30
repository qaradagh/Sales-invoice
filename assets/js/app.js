/* ==========================================================================
   فاکتور فروش — منطق برنامه
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'shilan-invoice-v1';
  var THEME_KEY = 'shilan-invoice-theme';
  var ZOOM_KEY = 'shilan-invoice-zoom';

  /* ───────────────── وضعیت پیش‌فرض ───────────────── */

  function defaultState() {
    var today = Jalali.toJalaali(new Date());
    return {
      seller: {
        name: 'شیلان ستور گستر',
        tagline: 'تولید و عرضه خوراک تخمیری دام',
        phone: '',
        address: '',
        regNo: '3628',
        iban: 'IR520190000000119715069004',
        account: '0119715069004',
        bank: 'بانک صادرات ایران'
      },
      buyer: { name: '', address: '', phone: '', idType: 'economic', nationalId: '' },
      invoice: {
        number: '1',
        currency: 'ریال',
        date: { y: today.jy, m: today.jm, d: today.jd }
      },
      items: [{ desc: 'خوراک تخمیری', qty: '', price: '' }],
      totals: { prevBalance: '', discountType: 'amount', discountValue: '', vatPercent: '', paid: '' },
      notes: '',
      options: { showWords: true, showStamp: true, showBank: true }
    };
  }

  var state = defaultState();

  /* ───────────────── ابزارهای کمکی ───────────────── */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function getPath(obj, path) {
    return path.split('.').reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (acc, key) {
      if (acc[key] == null || typeof acc[key] !== 'object') acc[key] = {};
      return acc[key];
    }, obj);
    target[last] = value;
  }

  /** ادغام امن داده بارگذاری‌شده با ساختار پیش‌فرض */
  function merge(base, incoming) {
    if (incoming == null || typeof incoming !== 'object') return base;
    Object.keys(base).forEach(function (key) {
      var b = base[key];
      var v = incoming[key];
      if (v === undefined) return;
      if (Array.isArray(b)) {
        if (Array.isArray(v)) base[key] = v;
      } else if (b && typeof b === 'object') {
        merge(b, v);
      } else {
        base[key] = v;
      }
    });
    return base;
  }

  /* ───────────────── محاسبات ───────────────── */

  function computeTotals() {
    var lines = state.items.map(function (item) {
      var qty = Fa.parseNum(item.qty);
      var price = Fa.parseNum(item.price);
      return { desc: item.desc, qty: qty, price: price, total: qty * price };
    });

    var subtotal = lines.reduce(function (sum, l) { return sum + l.total; }, 0);

    var discountType = state.totals.discountType === 'percent' ? 'percent' : 'amount';
    var discountValue = Fa.parseNum(state.totals.discountValue);
    var discount = discountType === 'percent'
      ? subtotal * Math.min(Math.max(discountValue, 0), 100) / 100
      : discountValue;
    discount = Math.min(Math.max(discount, 0), subtotal);

    var afterDiscount = subtotal - discount;
    var vatPercent = Math.max(Fa.parseNum(state.totals.vatPercent), 0);
    var vat = afterDiscount * vatPercent / 100;

    var prevBalance = Fa.parseNum(state.totals.prevBalance);
    var paid = Fa.parseNum(state.totals.paid);
    var payable = afterDiscount + vat + prevBalance - paid;

    return {
      lines: lines,
      subtotal: subtotal,
      discount: discount,
      discountType: discountType,
      discountValue: discountValue,
      vatPercent: vatPercent,
      vat: vat,
      prevBalance: prevBalance,
      paid: paid,
      payable: payable,
      totalQty: lines.reduce(function (sum, l) { return sum + l.qty; }, 0)
    };
  }

  /* ───────────────── ساخت فرم اقلام ───────────────── */

  var itemList = $('#itemList');

  function renderItemsForm() {
    var totals = computeTotals();
    itemList.innerHTML = '';

    state.items.forEach(function (item, index) {
      var row = document.createElement('div');
      row.className = 'item';
      row.innerHTML =
        '<div class="item__head">' +
          '<span class="item__no">' + Fa.toFaDigits(index + 1) + '</span>' +
          '<button type="button" class="item__del" data-del="' + index + '" title="حذف ردیف" aria-label="حذف ردیف">✕</button>' +
        '</div>' +
        '<label class="field">' +
          '<span class="field__label">شرح کالا</span>' +
          '<input type="text" data-item="desc" data-index="' + index + '" placeholder="خوراک تخمیری" />' +
        '</label>' +
        '<div class="item__grid">' +
          '<label class="field">' +
            '<span class="field__label">وزن (کیلوگرم)</span>' +
            '<input type="text" inputmode="decimal" data-item="qty" data-index="' + index + '" placeholder="۱۰۰۰" />' +
          '</label>' +
          '<label class="field">' +
            '<span class="field__label">قیمت هر کیلو</span>' +
            '<input type="text" inputmode="decimal" data-item="price" data-index="' + index + '" data-money placeholder="۲۱۰,۰۰۰" />' +
          '</label>' +
        '</div>' +
        '<div class="item__total"><span>جمع این ردیف</span>' +
          '<b>' + Fa.formatMoney(totals.lines[index].total) + ' ' + state.invoice.currency + '</b>' +
        '</div>';

      row.querySelector('[data-item="desc"]').value = item.desc || '';
      row.querySelector('[data-item="qty"]').value = item.qty === '' ? '' : Fa.formatQty(item.qty);
      row.querySelector('[data-item="price"]').value = item.price === '' ? '' : Fa.formatMoney(item.price);

      itemList.appendChild(row);
    });
  }

  /** فقط مبلغ هر ردیف را بدون بازسازی کامل به‌روز می‌کند (تا فوکوس از دست نرود) */
  function refreshItemTotals() {
    var totals = computeTotals();
    $$('.item', itemList).forEach(function (row, index) {
      var out = row.querySelector('.item__total b');
      if (out && totals.lines[index]) {
        out.textContent = Fa.formatMoney(totals.lines[index].total) + ' ' + state.invoice.currency;
      }
    });
  }

  /* ───────────────── نمایش فاکتور ───────────────── */

  function dateText() {
    var d = state.invoice.date;
    var y = Fa.parseNum(d.y), m = Fa.parseNum(d.m), day = Fa.parseNum(d.d);
    var valid = Jalali.isValid(y, m, day);

    var row = $('.date-row');
    if (row) row.classList.toggle('is-invalid', !valid);

    if (!valid) return '—';
    return Fa.toFaDigits(y) + '/' + Fa.toFaDigits(String(m).padStart(2, '0')) + '/' + Fa.toFaDigits(String(day).padStart(2, '0'));
  }

  function setOut(path, value) {
    $$('[data-out="' + path + '"]').forEach(function (el) { el.textContent = value; });
  }

  function toggleRow(path, hasValue) {
    $$('[data-row="' + path + '"]').forEach(function (el) {
      el.style.display = hasValue ? '' : 'none';
    });
  }

  function bindText(path) {
    var raw = String(getPath(state, path) || '').trim();
    setOut(path, raw ? Fa.toFaDigits(raw) : '');
    toggleRow(path, !!raw);
  }

  function renderPreview() {
    var t = computeTotals();
    var cur = state.invoice.currency;

    ['seller.name', 'seller.tagline', 'seller.phone', 'seller.address', 'seller.regNo',
      'seller.iban', 'seller.account', 'seller.bank',
      'buyer.address', 'buyer.phone', 'buyer.nationalId'].forEach(bindText);

    setOut('buyer.name', String(state.buyer.name || '').trim() || 'خریدار محترم');
    $('#outIdLabel').textContent = state.buyer.idType === 'national' ? 'کد ملی:' : 'کد اقتصادی:';
    setOut('invoice.number', Fa.toFaDigits(String(state.invoice.number || '').trim() || '—'));
    setOut('invoice.dateText', dateText());

    /* اقلام */
    var tbody = $('#outRows');
    tbody.innerHTML = '';

    var visible = t.lines.filter(function (l, i) {
      return String(state.items[i].desc || '').trim() !== '' || l.qty !== 0 || l.price !== 0;
    });

    if (!visible.length) {
      tbody.innerHTML = '<tr class="empty"><td colspan="5">هنوز قلمی ثبت نشده است — از پنل کناری ردیف اضافه کنید</td></tr>';
    } else {
      visible.forEach(function (l, i) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="c-idx">' + Fa.toFaDigits(i + 1) + '</td>' +
          '<td class="c-desc">' + escapeHtml(String(l.desc || '').trim() || '—') + '</td>' +
          '<td class="c-qty">' + Fa.formatQty(l.qty) + '<span class="unit">kg</span></td>' +
          '<td class="c-price">' + Fa.formatMoney(l.price) + '<span class="unit">' + cur + '</span></td>' +
          '<td class="c-sum">' + Fa.formatMoney(l.total) + '<span class="unit">' + cur + '</span></td>';
        tbody.appendChild(tr);
      });

      if (visible.length > 1) {
        var sumRow = document.createElement('tr');
        sumRow.className = 'sumline';
        sumRow.innerHTML =
          '<td class="c-idx"></td>' +
          '<td class="c-desc"><b>جمع اقلام</b></td>' +
          '<td class="c-qty"><b>' + Fa.formatQty(t.totalQty) + '</b><span class="unit">kg</span></td>' +
          '<td class="c-price"></td>' +
          '<td class="c-sum"><b>' + Fa.formatMoney(t.subtotal) + '</b><span class="unit">' + cur + '</span></td>';
        tbody.appendChild(sumRow);
      }
    }

    /* جمع‌بندی مبالغ */
    var rows = [];
    rows.push(money('جمع کل کالاها', t.subtotal, 'trow--sub'));
    if (t.discount > 0) {
      var dLabel = t.discountType === 'percent'
        ? 'تخفیف (' + Fa.toFaDigits(t.discountValue) + '٪)'
        : 'تخفیف';
      rows.push(money(dLabel, -t.discount, 'trow--minus'));
    }
    if (t.vat > 0) rows.push(money('مالیات بر ارزش افزوده (' + Fa.toFaDigits(t.vatPercent) + '٪)', t.vat));
    if (t.prevBalance !== 0) rows.push(money('مانده قبلی', t.prevBalance));
    if (t.paid !== 0) rows.push(money('پرداخت شده', -t.paid, 'trow--minus'));
    rows.push(money('قابل پرداخت', t.payable, 'trow--grand'));

    $('#outTotals').innerHTML = rows.join('');

    /* مبلغ به حروف */
    var wordsBox = $('#outWordsBox');
    if (state.options.showWords && t.payable !== 0) {
      wordsBox.style.display = '';
      $('#outWords').textContent = Fa.numberToWords(t.payable) + ' ' + cur +
        (t.payable < 0 ? ' (بستانکار)' : '');
    } else {
      wordsBox.style.display = 'none';
    }

    /* توضیحات */
    var notes = String(state.notes || '').trim();
    $('#outNotesBox').style.display = notes ? '' : 'none';
    $('#outNotes').textContent = Fa.toFaDigits(notes);

    /* اطلاعات بانکی */
    var hasBank = !!(String(state.seller.iban || '').trim() || String(state.seller.account || '').trim());
    $('#outBankBox').style.display = (state.options.showBank && hasBank) ? '' : 'none';

    /* امضا */
    $('#outSign').style.display = state.options.showStamp ? '' : 'none';

    updateScale();
  }

  function money(label, value, cls) {
    return '<div class="trow ' + (cls || '') + '">' +
      '<span class="trow__label">' + label + '</span>' +
      '<span class="trow__value">' + Fa.formatMoney(value) +
        '<span class="cur">' + state.invoice.currency + '</span></span>' +
      '</div>';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ───────────────── مقیاس برگه A4 ───────────────── */

  var stage = $('#stage');
  var sheet = $('#sheet');
  var previewWrap = $('#previewWrap');

  function mmToPx(mm) {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:' + mm + 'mm';
    document.body.appendChild(probe);
    var px = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);
    return px;
  }

  var A4_WIDTH_PX = 0;
  var A4_HEIGHT_PX = 0;
  var lastScale = null;
  var lastHeight = null;
  var stacked = window.matchMedia('(max-width: 900px)');

  /* 'fit' = کل برگه در ارتفاع پنجره، 'full' = اندازه واقعی (با اسکرول پیش‌نمایش) */
  var zoomMode = 'fit';
  try { zoomMode = localStorage.getItem(ZOOM_KEY) === 'full' ? 'full' : 'fit'; } catch (e) { /* پیش‌فرض */ }

  /** ارتفاع نوار بالا را اندازه می‌گیرد تا پیش‌نمایش دقیقاً زیر آن بچسبد */
  function updateTopbarHeight() {
    var bar = $('.topbar');
    if (!bar) return;
    document.documentElement.style.setProperty('--topbar-h', Math.round(bar.offsetHeight) + 'px');
  }

  function updateScale() {
    if (!A4_WIDTH_PX) {
      A4_WIDTH_PX = mmToPx(210);
      A4_HEIGHT_PX = mmToPx(297);
    }

    var styles = getComputedStyle(previewWrap);
    var availableW = previewWrap.clientWidth
      - parseFloat(styles.paddingInlineStart || 0)
      - parseFloat(styles.paddingInlineEnd || 0);

    var scale = availableW / A4_WIDTH_PX;

    /* در حالت «متناسب با صفحه» یک برگه کامل در ارتفاع پنجره جا می‌شود */
    if (!stacked.matches && zoomMode === 'fit') {
      var availableH = previewWrap.clientHeight
        - parseFloat(styles.paddingTop || 0)
        - parseFloat(styles.paddingBottom || 0);
      if (availableH > 0) scale = Math.min(scale, availableH / A4_HEIGHT_PX);
    }

    scale = Math.min(1, scale);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    scale = Number(scale.toFixed(4));

    var height = sheet.offsetHeight;

    if (scale !== lastScale) {
      lastScale = scale;
      stage.style.setProperty('--scale', scale);
      sheet.style.setProperty('--scale', scale);
    }
    if (height !== lastHeight) {
      lastHeight = height;
      stage.style.setProperty('--sheet-h', height + 'px');
    }
  }

  /* ───────────────── همگام‌سازی فرم ───────────────── */

  var MONEY_PATHS = ['totals.prevBalance', 'totals.discountValue', 'totals.paid'];

  function fillForm() {
    $$('[data-path]').forEach(function (el) {
      var path = el.dataset.path;
      var value = getPath(state, path);
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else if (el.hasAttribute('data-money')) {
        el.value = (value === '' || value == null) ? '' : Fa.formatMoney(value);
      } else if (path === 'invoice.date.y' || path === 'invoice.date.d') {
        el.value = value == null ? '' : Fa.toFaDigits(value);
      } else {
        el.value = value == null ? '' : value;
      }
    });
  }

  function readInput(el) {
    var path = el.dataset.path;
    if (el.type === 'checkbox') return el.checked;
    if (el.tagName === 'SELECT') return el.value;
    if (el.hasAttribute('data-money') || MONEY_PATHS.indexOf(path) > -1) {
      return el.value.trim() === '' ? '' : Fa.parseNum(el.value);
    }
    if (path === 'invoice.date.y' || path === 'invoice.date.m' || path === 'invoice.date.d' || path === 'totals.vatPercent') {
      return el.value.trim() === '' ? '' : Fa.parseNum(el.value);
    }
    return el.value;
  }

  document.addEventListener('input', function (e) {
    var el = e.target;

    if (el.dataset && el.dataset.path) {
      setPath(state, el.dataset.path, readInput(el));
      if (el.dataset.path === 'invoice.currency') renderItemsForm();
      renderPreview();
      save();
      return;
    }

    if (el.dataset && el.dataset.item) {
      var index = Number(el.dataset.index);
      var field = el.dataset.item;
      if (!state.items[index]) return;
      state.items[index][field] = (field === 'desc')
        ? el.value
        : (el.value.trim() === '' ? '' : Fa.parseNum(el.value));
      refreshItemTotals();
      renderPreview();
      save();
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.type === 'checkbox' && el.dataset.path) {
      setPath(state, el.dataset.path, el.checked);
      renderPreview();
      save();
    }
  });

  /* قالب‌بندی مجدد فیلدهای عددی هنگام خروج از فوکوس */
  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el.dataset) return;

    if (el.hasAttribute('data-money') && el.value.trim() !== '') {
      el.value = Fa.formatMoney(Fa.parseNum(el.value));
    } else if (el.dataset.item === 'qty' && el.value.trim() !== '') {
      el.value = Fa.formatQty(Fa.parseNum(el.value));
    } else if ((el.dataset.path === 'invoice.date.y' || el.dataset.path === 'invoice.date.d') && el.value.trim() !== '') {
      el.value = Fa.toFaDigits(Fa.parseNum(el.value));
    }
  });

  /* ───────────────── رویدادهای دکمه‌ها ───────────────── */

  itemList.addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (!del) return;
    var index = Number(del.dataset.del);
    state.items.splice(index, 1);
    if (!state.items.length) state.items.push({ desc: '', qty: '', price: '' });
    renderItemsForm();
    renderPreview();
    save();
  });

  function addItem() {
    state.items.push({ desc: '', qty: '', price: '' });
    renderItemsForm();
    renderPreview();
    save();
    var inputs = $$('[data-item="desc"]', itemList);
    var last = inputs[inputs.length - 1];
    if (last) {
      last.focus();
      last.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  $('#btnAddItem').addEventListener('click', addItem);

  /* زدن Enter در فیلدهای یک ردیف، ردیف بعدی را می‌سازد */
  itemList.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    var index = Number(e.target.dataset.index);
    if (index === state.items.length - 1) addItem();
    else {
      var next = itemList.querySelector('[data-item="desc"][data-index="' + (index + 1) + '"]');
      if (next) next.focus();
    }
  });

  $('#btnToday').addEventListener('click', function () {
    var today = Jalali.toJalaali(new Date());
    state.invoice.date = { y: today.jy, m: today.jm, d: today.jd };
    fillForm();
    renderPreview();
    save();
  });

  $('#btnPrint').addEventListener('click', function () {
    window.print();
  });

  $('#btnSave').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = Fa.fileLabel(state.invoice.number) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('#btnLoad').addEventListener('click', function () { $('#fileInput').click(); });

  $('#fileInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = merge(defaultState(), JSON.parse(reader.result));
        renderAll();
        save();
      } catch (err) {
        alert('فایل معتبر نیست.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('#btnReset').addEventListener('click', function () {
    if (!confirm('اطلاعات فاکتور فعلی پاک شود؟ (اطلاعات فروشنده حفظ می‌شود)')) return;
    var seller = state.seller;
    var options = state.options;
    var number = Fa.parseNum(state.invoice.number);
    state = defaultState();
    state.seller = seller;
    state.options = options;
    if (number) state.invoice.number = number + 1;
    renderAll();
    save();
  });

  $$('.card__head').forEach(function (head) {
    head.addEventListener('click', function () {
      var card = head.parentElement;
      card.dataset.open = card.dataset.open === 'true' ? 'false' : 'true';
    });
  });

  /* اندازه پیش‌نمایش */
  function applyZoomLabel() {
    $('#zoomLabel').textContent = zoomMode === 'fit' ? 'اندازه واقعی' : 'متناسب با صفحه';
  }

  $('#btnZoom').addEventListener('click', function () {
    zoomMode = zoomMode === 'fit' ? 'full' : 'fit';
    try { localStorage.setItem(ZOOM_KEY, zoomMode); } catch (e) { /* بی‌اهمیت */ }
    applyZoomLabel();
    lastScale = null;
    updateScale();
    previewWrap.scrollTop = 0;
  });

  /* تم */
  var btnTheme = $('#btnTheme');
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* بی‌اهمیت */ }
  }
  btnTheme.addEventListener('click', function () {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  /* ───────────────── ذخیره‌سازی ───────────────── */

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* بی‌اهمیت */ }
    }, 250);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = merge(defaultState(), JSON.parse(raw));
    } catch (e) { /* از پیش‌فرض استفاده می‌شود */ }
  }

  /* ───────────────── راه‌اندازی ───────────────── */

  function buildMonthSelect() {
    var select = $('#monthSelect');
    Jalali.MONTHS.forEach(function (name, i) {
      var opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = name;
      select.appendChild(opt);
    });
  }

  function renderAll() {
    fillForm();
    renderItemsForm();
    renderPreview();
  }

  function init() {
    try {
      var savedTheme = localStorage.getItem(THEME_KEY);
      applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    } catch (e) { applyTheme('light'); }

    buildMonthSelect();
    load();
    applyZoomLabel();
    updateTopbarHeight();
    renderAll();

    window.addEventListener('resize', function () {
      updateTopbarHeight();
      updateScale();
    });
    if (window.ResizeObserver) {
      new ResizeObserver(updateScale).observe(previewWrap);
      new ResizeObserver(updateScale).observe(sheet);
      new ResizeObserver(updateTopbarHeight).observe($('.topbar'));
    }
    if (stacked.addEventListener) stacked.addEventListener('change', updateScale);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateScale);
    }
    window.addEventListener('beforeprint', function () {
      sheet.style.setProperty('--scale', '1');
    });
    window.addEventListener('afterprint', updateScale);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

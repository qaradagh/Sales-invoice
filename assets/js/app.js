/* ==========================================================================
   فاکتور فروش — منطق برنامه
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'shilan-invoice-v1';
  var THEME_KEY = 'shilan-invoice-theme';
  var ZOOM_KEY = 'shilan-invoice-zoom';
  var ARCHIVE_KEY = 'shilan-invoice-archive-v1';
  var CONTACTS_KEY = 'shilan-invoice-contacts-v1';
  var ARCHIVE_LIMIT = 300;

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
        date: { y: today.jy, m: today.jm, d: today.jd },
        loadingDate: { y: '', m: '', d: '' }
      },
      footer: { name: 'شیلان ستور گستر', phone: '' },
      items: [{ desc: 'خوراک تخمیری', qty: '', price: '' }],
      totals: { prevBalance: '', discountType: 'amount', discountValue: '', vatPercent: '', paid: '', shippingValue: '' },
      notes: '',
      options: { showWords: true, showStamp: true, showReceiver: true, showBank: true }
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

  /** فاکتورهای قدیمی همان نام و تلفن قبلی را در پایین برگه نگه می‌دارند. */
  function restoreState(incoming) {
    var restored = merge(defaultState(), incoming);
    var footer = incoming && incoming.footer;
    if (!footer || typeof footer.name !== 'string') restored.footer.name = restored.seller.name;
    if (!footer || typeof footer.phone !== 'string') restored.footer.phone = restored.seller.phone;
    return restored;
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

    // هزینه حمل و نقل هم مثل مانده قبلی، پرداخت‌شده و مالیات: فیلد همیشه در فرم هست،
    // ولی فقط وقتی مقدارش صفر نباشد وارد محاسبه/نمایش می‌شود (قرارداد «ردیف خالی نمایش داده نمی‌شود»، رجوع کنید به renderPreview).
    var shipping = Fa.parseNum(state.totals.shippingValue);

    var prevBalance = Fa.parseNum(state.totals.prevBalance);
    var paid = Fa.parseNum(state.totals.paid);
    var payable = afterDiscount + vat + shipping + prevBalance - paid;

    return {
      lines: lines,
      subtotal: subtotal,
      discount: discount,
      discountType: discountType,
      discountValue: discountValue,
      vatPercent: vatPercent,
      vat: vat,
      shipping: shipping,
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

  function dateText(d, selector, optional) {
    var y = Fa.parseNum(d.y), m = Fa.parseNum(d.m), day = Fa.parseNum(d.d);
    var empty = [d.y, d.m, d.d].every(function (value) { return value === '' || value == null; });
    var valid = Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(day) && Jalali.isValid(y, m, day);

    var row = $(selector);
    if (row) {
      row.classList.toggle('is-invalid', !valid && !(optional && empty));
      $$('input, select', row).forEach(function (input) {
        input.setAttribute('aria-invalid', String(!valid && !(optional && empty)));
      });
    }

    if (optional && empty) return '';
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
    setOut('invoice.currency', cur);
    $('#editorPayable').textContent = Fa.formatMoney(t.payable) + ' ' + cur;

    ['seller.name', 'seller.tagline', 'seller.phone', 'seller.address', 'seller.regNo',
      'seller.iban', 'seller.account', 'seller.bank',
      'buyer.address', 'buyer.phone', 'buyer.nationalId', 'footer.name', 'footer.phone'].forEach(bindText);

    var hasFooterName = !!String(state.footer.name || '').trim();
    var hasFooterPhone = !!String(state.footer.phone || '').trim();
    $('.sheet__footline').style.display = hasFooterName || hasFooterPhone ? '' : 'none';
    var footerDot = $('.sheet__footline .dot');
    if (footerDot) footerDot.style.display = hasFooterName && hasFooterPhone ? '' : 'none';

    setOut('buyer.name', String(state.buyer.name || '').trim() || 'خریدار محترم');
    $('#outIdLabel').textContent = state.buyer.idType === 'national' ? 'کد ملی:' : 'کد اقتصادی:';
    setOut('invoice.number', Fa.toFaDigits(String(state.invoice.number || '').trim() || '—'));
    setOut('invoice.dateText', dateText(state.invoice.date, '.date-row', false));
    var loadingDateText = dateText(state.invoice.loadingDate, '#loadingDateRow', true);
    setOut('invoice.loadingDateText', loadingDateText);
    toggleRow('invoice.loadingDateText', !!loadingDateText);

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

    /* جمع‌بندی مبالغ
       قرارداد کلی: هر ردیفی که مقدارش صفر/خالی باشد، اصلاً در پیش‌نمایش و چاپ فاکتور نشان داده نمی‌شود
       (همین الان برای تخفیف، مالیات، هزینه حمل و نقل، مانده قبلی و پرداخت‌شده اعمال شده).
       برای افزودن یک ردیف مبلغی جدید با همین رفتار، کافیست مثل موارد زیر یک شرط `if (مقدار !== 0)` قبل از push اضافه شود. */
    var rows = [];
    rows.push(money('جمع کل کالاها', t.subtotal, 'trow--sub'));
    if (t.discount > 0) {
      var dLabel = t.discountType === 'percent'
        ? 'تخفیف (' + Fa.toFaDigits(t.discountValue) + '٪)'
        : 'تخفیف';
      rows.push(money(dLabel, -t.discount, 'trow--minus'));
    }
    if (t.vat > 0) rows.push(money('مالیات بر ارزش افزوده (' + Fa.toFaDigits(t.vatPercent) + '٪)', t.vat));
    if (t.shipping !== 0) rows.push(money('هزینه حمل و نقل', t.shipping));
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
    var sign = $('#outSign');
    sign.style.display = state.options.showStamp ? '' : 'none';
    $('#outReceiver').style.display = state.options.showReceiver ? '' : 'none';
    sign.classList.toggle('sheet__sign--two', !state.options.showReceiver);

    updateScale();
  }

  /* ───────────────── نام فایل خروجی ───────────────── */

  /**
   * «شماره_تاریخ_خریدار» — مثلاً 0042_1405.05.08_احمدی
   * شماره با صفر پر می‌شود تا مرتب‌سازی حروفی در پوشه با ترتیب عددی یکی شود
   * (وگرنه فاکتور ۱۰۰ قبل از ۲ می‌آید) و ارقام لاتین‌اند تا همه‌جا درست بچینند.
   */
  function fileLabel() {
    var parts = [];

    var number = Fa.safeFileText(Fa.toLatinDigits(state.invoice.number));
    if (number) parts.push(/^\d+$/.test(number) ? number.padStart(4, '0') : number);

    var d = state.invoice.date;
    var y = Fa.parseNum(d.y), m = Fa.parseNum(d.m), day = Fa.parseNum(d.d);
    if (Jalali.isValid(y, m, day)) {
      parts.push(y + '.' + String(m).padStart(2, '0') + '.' + String(day).padStart(2, '0'));
    }

    var buyer = Fa.safeFileText(state.buyer.name).slice(0, 40).trim();
    if (buyer) parts.push(buyer);

    return parts.length ? parts.join('_') : 'فاکتور';
  }

  window.Invoice = { fileLabel: fileLabel, recordArchive: recordArchive };

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
        - parseFloat(styles.paddingBottom || 0)
        - $('.preview-toolbar').offsetHeight - 20;
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

  var MONEY_PATHS = ['totals.prevBalance', 'totals.discountValue', 'totals.paid', 'totals.shippingValue'];

  function isDatePath(path) {
    return /^invoice\.(date|loadingDate)\.(y|m|d)$/.test(path || '');
  }

  function fillForm() {
    $$('[data-path]').forEach(function (el) {
      var path = el.dataset.path;
      var value = getPath(state, path);
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else if (el.hasAttribute('data-money')) {
        el.value = (value === '' || value == null) ? '' : Fa.formatMoney(value);
      } else if (isDatePath(path) && el.tagName !== 'SELECT') {
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
    if (isDatePath(path) || path === 'totals.vatPercent') {
      return el.value.trim() === '' ? '' : Fa.parseNum(el.value);
    }
    return el.value;
  }

  document.addEventListener('input', function (e) {
    var el = e.target;

    if (el.dataset && el.dataset.path) {
      setPath(state, el.dataset.path, readInput(el));
      if (el.dataset.path === 'invoice.currency') renderItemsForm();
      if (el.dataset.path === 'buyer.name') applyContactAutofill(el.value);
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
    } else if (isDatePath(el.dataset.path) && el.tagName !== 'SELECT' && el.value.trim() !== '') {
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

  var loadingToday = $('#btnLoadingToday');
  if (loadingToday) loadingToday.addEventListener('click', function () {
    var today = Jalali.toJalaali(new Date());
    state.invoice.loadingDate = { y: today.jy, m: today.jm, d: today.jd };
    renderAll();
    save();
  });

  var clearLoading = $('#btnClearLoadingDate');
  if (clearLoading) clearLoading.addEventListener('click', function () {
    state.invoice.loadingDate = { y: '', m: '', d: '' };
    renderAll();
    save();
  });

  var quickEntryButton = $('#btnQuickEntry');
  if (quickEntryButton) quickEntryButton.addEventListener('click', function () {
    var status = $('#quickEntryStatus');
    var year = Fa.parseNum(state.invoice.date.y);
    if (!Number.isInteger(year) || year < 1200 || year > 1700) year = Jalali.toJalaali(new Date()).jy;
    var result = QuickEntry.parse($('#quickEntryText').value, { year: year });
    if (result.errors.length) {
      status.textContent = result.errors.join(' ');
      status.dataset.state = 'error';
      return;
    }
    var changed = [];
    if (result.buyerName) {
      if (String(state.buyer.name || '').trim() !== result.buyerName.trim()) {
        state.buyer = { name: result.buyerName, address: '', phone: '', idType: 'economic', nationalId: '' };
      }
      applyContactAutofill(result.buyerName);
      changed.push('نام خریدار');
    }
    if (result.loadingDate) {
      state.invoice.loadingDate = result.loadingDate;
      changed.push('تاریخ بارگیری');
    }
    if (result.issueDate) {
      state.invoice.date = result.issueDate;
      changed.push('تاریخ صدور');
    }
    if (result.currency) {
      state.invoice.currency = result.currency;
      changed.push('واحد پول');
    }
    if (result.weightKg !== undefined || result.price !== undefined || result.description) {
      if (!state.items.length) state.items.push({ desc: 'خوراک تخمیری', qty: '', price: '' });
      if (result.weightKg !== undefined) { state.items[0].qty = result.weightKg; changed.push('وزن ردیف اول'); }
      if (result.price !== undefined) { state.items[0].price = result.price; changed.push('قیمت ردیف اول'); }
      if (result.description) { state.items[0].desc = result.description; changed.push('شرح ردیف اول'); }
    }
    renderAll();
    save();
    status.dataset.state = 'success';
    status.textContent = changed.join('، ') + ' وارد شد. ' + (result.warnings || []).join(' ');
  });

  $('#btnPrint').addEventListener('click', function () {
    recordArchive();
    window.print();
  });

  $('#btnSave').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileLabel() + '.json';
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
        state = restoreState(JSON.parse(reader.result));
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
    var footer = state.footer;
    var options = state.options;
    var number = Fa.parseNum(state.invoice.number);
    state = defaultState();
    state.seller = seller;
    state.footer = footer;
    state.options = options;
    if (number) state.invoice.number = number + 1;
    renderAll();
    save();
  });

  $$('.card__head').forEach(function (head) {
    head.addEventListener('click', function () {
      var card = head.parentElement;
      card.dataset.open = card.dataset.open === 'true' ? 'false' : 'true';
      head.setAttribute('aria-expanded', card.dataset.open);
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

  /* ───────────────── آرشیو فاکتورها ─────────────────
     هر بار که فاکتور چاپ یا به PDF/PNG تبدیل می‌شود، یک نسخهٔ کامل از آن
     (برای بازکردن دوباره) به همراه خلاصه‌اش (خریدار، شماره، تاریخ، مبلغ)
     در localStorage آرشیو می‌شود. اگر شماره‌ی فاکتور قبلاً آرشیو شده باشد،
     همان ردیف به‌روزرسانی می‌شود تا با هر بار پرینت مجدد، ردیف تکراری
     ساخته نشود. */

  function loadArchive() {
    try {
      var list = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveArchive(list) {
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list)); } catch (e) { /* بی‌اهمیت */ }
  }

  function jalaliShort(d) {
    var y = Fa.parseNum(d.y), m = Fa.parseNum(d.m), day = Fa.parseNum(d.d);
    if (!Jalali.isValid(y, m, day)) return '—';
    return Fa.toFaDigits(day) + ' ' + (Jalali.MONTHS[m - 1] || '') + ' ' + Fa.toFaDigits(y);
  }

  /** فاکتور جاری را در آرشیو ذخیره (یا در صورت هم‌شماره بودن، به‌روزرسانی) می‌کند */
  function recordArchive() {
    var number = String(state.invoice.number || '').trim();
    var buyerName = String(state.buyer.name || '').trim();
    if (!number && !buyerName) return; // فاکتور خالی آرشیو نمی‌شود

    var t = computeTotals();
    var entry = {
      id: Fa.toLatinDigits(number) || ('id-' + Date.now()),
      number: state.invoice.number,
      date: { y: state.invoice.date.y, m: state.invoice.date.m, d: state.invoice.date.d },
      buyerName: buyerName || 'بدون نام',
      currency: state.invoice.currency,
      payable: t.payable,
      savedAt: Date.now(),
      state: JSON.parse(JSON.stringify(state))
    };

    upsertContact(state.buyer);

    if (archiveDirHandle) {
      writeInvoiceToFolder(entry).then(renderArchiveList);
      return;
    }

    var list = loadArchive();
    var key = Fa.toLatinDigits(number);
    var idx = -1;
    if (key) {
      for (var i = 0; i < list.length; i++) {
        if (Fa.toLatinDigits(String(list[i].number || '')) === key) { idx = i; break; }
      }
    }
    if (idx > -1) { entry.id = list[idx].id; list[idx] = entry; } else { list.unshift(entry); }
    list.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    if (list.length > ARCHIVE_LIMIT) list = list.slice(0, ARCHIVE_LIMIT);
    saveArchive(list);
    renderArchiveList();
  }

  /** آرشیو را می‌خواند: اگر پوشه‌ای وصل باشد از همان‌جا، وگرنه از حافظه‌ی مرورگر */
  function getArchiveList() {
    if (archiveDirHandle) return readFolderEntries();
    return Promise.resolve(loadArchive());
  }

  function renderArchiveList() {
    var wrap = $('#archiveList');
    var empty = $('#archiveEmptyMsg');
    if (!wrap) return Promise.resolve();
    return getArchiveList().then(function (list) {
      list = list.slice().sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
      if (empty) empty.hidden = list.length > 0;
      wrap.innerHTML = list.map(function (e) {
        return '<div class="archive-item">' +
          '<div class="archive-item__info">' +
          '<span class="archive-item__name">' + escapeHtml(e.buyerName || 'بدون نام') + '</span>' +
          '<span class="archive-item__meta">شماره ' + escapeHtml(Fa.toFaDigits(String(e.number || '—'))) +
          ' · ' + jalaliShort(e.date) + ' · ' + Fa.formatMoney(e.payable) + ' ' + escapeHtml(e.currency || '') + '</span>' +
          '</div>' +
          '<div class="archive-item__actions">' +
          '<button type="button" class="btn btn--mini" data-archive-open="' + escapeHtml(String(e.id)) + '">بازکردن</button>' +
          '<button type="button" class="btn btn--mini btn--danger-ghost" data-archive-del="' + escapeHtml(String(e.id)) + '">حذف</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }).catch(function (err) {
      console.error(err);
      wrap.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = 'خواندن آرشیو از پوشه ممکن نشد؛ اتصال پوشه را بررسی کنید.'; }
    });
  }

  var archiveOpener = null;
  function openArchiveModal() {
    archiveOpener = document.activeElement;
    renderArchiveList();
    var modal = $('#archiveModal');
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-archive-close].modal__close').focus();
  }

  function closeArchiveModal() {
    var modal = $('#archiveModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (archiveOpener && archiveOpener.focus) archiveOpener.focus();
  }

  (function wireArchiveModal() {
    var modal = $('#archiveModal');
    var btn = $('#btnArchive');
    if (btn) btn.addEventListener('click', openArchiveModal);
    if (!modal) return;

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-archive-close]')) { closeArchiveModal(); return; }

      var openBtn = e.target.closest('[data-archive-open]');
      if (openBtn) {
        var openId = openBtn.dataset.archiveOpen;
        getArchiveList().then(function (list) {
          return list.filter(function (x) { return String(x.id) === openId; })[0];
        }).then(function (entry) {
          if (!entry) { alert('این فاکتور پیدا نشد.'); return; }
          if (!confirm('فاکتور فعلی جایگزین می‌شود. اگر فاکتور فعلی را آرشیو نکرده‌اید، اطلاعاتش از دست می‌رود. ادامه می‌دهید؟')) return;
          state = restoreState(JSON.parse(JSON.stringify(entry.state)));
          renderAll();
          save();
          closeArchiveModal();
        }).catch(function (err) { console.error(err); alert('باز کردن فاکتور ممکن نشد.'); });
        return;
      }

      var delBtn = e.target.closest('[data-archive-del]');
      if (delBtn) {
        var delId = delBtn.dataset.archiveDel;
        if (!confirm('این فاکتور از آرشیو حذف شود؟')) return;
        if (archiveDirHandle) {
          getArchiveList().then(function (list) {
            var entry = list.filter(function (x) { return String(x.id) === delId; })[0];
            return entry ? archiveDirHandle.removeEntry(archiveFileName(entry)) : null;
          }).then(renderArchiveList).catch(function (err) { console.error(err); alert('حذف فایل از پوشه ممکن نشد.'); });
        } else {
          saveArchive(loadArchive().filter(function (x) { return x.id !== delId; }));
          renderArchiveList();
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeArchiveModal();
    });
  })();

  /* ───────────────── خریدارهای پرتکرار (مثل مخاطبین گوشی) ─────────────────
     هر بار که فاکتوری آرشیو می‌شود، اطلاعات خریدارش ذخیره/به‌روزرسانی می‌شود.
     با تایپ نام یک خریدار قبلی در فیلد «نام خریدار»، بقیه‌ی فیلدها
     (آدرس، تلفن، کد اقتصادی/ملی) خودکار پر می‌شوند. */

  function loadContacts() {
    try {
      var list = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveContacts(list) {
    try { localStorage.setItem(CONTACTS_KEY, JSON.stringify(list)); } catch (e) { /* بی‌اهمیت */ }
  }

  function upsertContact(buyer) {
    var name = String(buyer.name || '').trim();
    if (!name) return;
    var list = loadContacts();
    var key = name.toLowerCase();
    var found = list.filter(function (c) { return String(c.name || '').trim().toLowerCase() === key; })[0];
    if (found) {
      found.name = name;
      found.address = buyer.address || '';
      found.phone = buyer.phone || '';
      found.idType = buyer.idType || 'economic';
      found.nationalId = buyer.nationalId || '';
      found.count = (found.count || 1) + 1;
      found.lastUsed = Date.now();
    } else {
      list.push({
        name: name,
        address: buyer.address || '',
        phone: buyer.phone || '',
        idType: buyer.idType || 'economic',
        nationalId: buyer.nationalId || '',
        count: 1,
        lastUsed: Date.now()
      });
    }
    saveContacts(list);
    renderContactsDatalist();
  }

  function renderContactsDatalist() {
    var dl = $('#buyerContactsList');
    if (!dl) return;
    var list = loadContacts().slice().sort(function (a, b) {
      return (b.count || 0) - (a.count || 0) || (b.lastUsed || 0) - (a.lastUsed || 0);
    });
    dl.innerHTML = list.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '"></option>';
    }).join('');
  }

  function applyContactAutofill(name) {
    var key = String(name || '').trim().toLowerCase();
    if (!key) return;
    var contact = loadContacts().filter(function (c) { return String(c.name || '').trim().toLowerCase() === key; })[0];
    if (!contact) return;
    state.buyer.address = contact.address || '';
    state.buyer.phone = contact.phone || '';
    state.buyer.idType = contact.idType || 'economic';
    state.buyer.nationalId = contact.nationalId || '';
    fillForm();
  }

  /* ───────────────── پوشه‌ی آرشیو روی دستگاه (File System Access API) ─────────────────
     اختیاری: اگر کاربر یک پوشه را انتخاب کند (فقط در کروم/اِج، دسکتاپ و اندروید)،
     هر فاکتور به‌عنوان یک فایل JSON جداگانه در همان پوشه ذخیره می‌شود و لیست آرشیو
     مستقیماً از همان پوشه خوانده می‌شود. چون این فایل‌ها روی دیسک هستند نه داخل
     localStorage، با پاک شدن اطلاعات یا حتی حذف/نصب دوباره‌ی برنامه از بین نمی‌روند؛
     کافی‌ست دوباره همان پوشه انتخاب/وصل شود. دسته‌ی پوشه (handle) برای دفعات بعد در
     IndexedDB نگه داشته می‌شود (چون در localStorage قابل ذخیره نیست). در مرورگرهایی
     که این قابلیت را ندارند (مثل سافاری/آیفون)، آرشیو فقط در همین مرورگر
     (localStorage) ذخیره می‌شود؛ کد قبلی مربوط به آن دست‌نخورده باقی مانده است. */

  var FOLDER_DB_NAME = 'shilan-invoice-fs';
  var FOLDER_DB_STORE = 'handles';
  var FOLDER_DB_KEY = 'archiveDir';

  var archiveDirHandle = null;
  var pendingFolderHandle = null;

  function folderSupported() { return typeof window.showDirectoryPicker === 'function'; }

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(FOLDER_DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(FOLDER_DB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbSet(key, value) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOLDER_DB_STORE, 'readwrite');
        tx.objectStore(FOLDER_DB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOLDER_DB_STORE, 'readonly');
        var req = tx.objectStore(FOLDER_DB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbDelete(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FOLDER_DB_STORE, 'readwrite');
        tx.objectStore(FOLDER_DB_STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function setFolderStatus(text) {
    var el = $('#folderStatus');
    if (el) el.textContent = text;
  }

  function setFolderButtons(mode) {
    var pickBtn = $('#btnPickFolder');
    var reconnectBtn = $('#btnReconnectFolder');
    var unlinkBtn = $('#btnUnlinkFolder');
    if (pickBtn) pickBtn.hidden = mode === 'unsupported';
    if (reconnectBtn) reconnectBtn.hidden = mode !== 'pending';
    if (unlinkBtn) unlinkBtn.hidden = mode !== 'connected';
  }

  /** نام فایل هر فاکتور در پوشه: بر پایه‌ی شماره‌ی فاکتور (پایدار، برای جلوگیری از تکرار) */
  function archiveFileName(entry) {
    var num = Fa.safeFileText(Fa.toLatinDigits(String(entry.number || '')));
    if (num && /^\d+$/.test(num)) return num.padStart(4, '0') + '.json';
    if (num) return (Fa.safeFileText(num) || 'فاکتور') + '.json';
    return 'id-' + entry.id + '.json';
  }

  function writeInvoiceToFolder(entry) {
    if (!archiveDirHandle) return Promise.resolve();
    return archiveDirHandle.getFileHandle(archiveFileName(entry), { create: true })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (writable) {
        return writable.write(JSON.stringify(entry, null, 2)).then(function () { return writable.close(); });
      })
      .catch(function (err) {
        console.error(err);
        setFolderStatus('نوشتن فایل در پوشه ناموفق بود؛ اتصال پوشه را بررسی کنید');
      });
  }

  function readFolderEntries() {
    if (!archiveDirHandle) return Promise.resolve([]);
    var out = [];
    var it = archiveDirHandle.entries();
    function step() {
      return it.next().then(function (res) {
        if (res.done) return out;
        var name = res.value[0];
        var handle = res.value[1];
        if (handle.kind === 'file' && /\.json$/i.test(name)) {
          return handle.getFile()
            .then(function (file) { return file.text(); })
            .then(function (text) {
              try {
                var entry = JSON.parse(text);
                if (entry && entry.buyerName !== undefined) out.push(entry);
              } catch (e) { /* فایل خراب — نادیده گرفته می‌شود */ }
              return step();
            });
        }
        return step();
      });
    }
    return step();
  }

  /** یک‌بار، هنگام اتصال پوشه‌ی جدید: آرشیو موجود در حافظه‌ی مرورگر هم داخل پوشه کپی می‌شود */
  function migrateLocalArchiveIntoFolder() {
    var list = loadArchive();
    return list.reduce(function (p, entry) {
      return p.then(function () { return writeInvoiceToFolder(entry); });
    }, Promise.resolve());
  }

  function connectFolder(handle) {
    archiveDirHandle = handle;
    pendingFolderHandle = null;
    setFolderStatus('متصل به پوشه‌ی «' + handle.name + '»');
    setFolderButtons('connected');
    return idbSet(FOLDER_DB_KEY, handle)
      .then(migrateLocalArchiveIntoFolder)
      .then(renderArchiveList);
  }

  function pickFolder() {
    if (!folderSupported()) {
      alert('این مرورگر از انتخاب پوشه پشتیبانی نمی‌کند؛ از کروم یا اِج روی اندروید یا کامپیوتر استفاده کنید.');
      return;
    }
    window.showDirectoryPicker({ mode: 'readwrite' })
      .then(connectFolder)
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        alert('انتخاب پوشه ممکن نشد.');
      });
  }

  function reconnectFolder() {
    if (!pendingFolderHandle) return;
    pendingFolderHandle.requestPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm === 'granted') connectFolder(pendingFolderHandle);
      else setFolderStatus('اجازه داده نشد — می‌توانید دوباره تلاش کنید یا پوشه‌ی دیگری انتخاب کنید');
    });
  }

  function unlinkFolder() {
    archiveDirHandle = null;
    pendingFolderHandle = null;
    idbDelete(FOLDER_DB_KEY).then(function () {
      setFolderStatus('پوشه‌ای وصل نیست — فاکتورها فقط در همین مرورگر ذخیره می‌شوند');
      setFolderButtons('none');
      renderArchiveList();
    });
  }

  function restoreFolderHandle() {
    if (!folderSupported()) {
      setFolderStatus('این مرورگر از پوشه‌ی آرشیو پشتیبانی نمی‌کند؛ فاکتورها فقط در همین مرورگر ذخیره می‌شوند');
      setFolderButtons('unsupported');
      return Promise.resolve();
    }
    return idbGet(FOLDER_DB_KEY).then(function (handle) {
      if (!handle) {
        setFolderStatus('پوشه‌ای وصل نیست — فاکتورها فقط در همین مرورگر ذخیره می‌شوند');
        setFolderButtons('none');
        return;
      }
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm === 'granted') return connectFolder(handle);
        pendingFolderHandle = handle;
        setFolderStatus('برای اتصال به پوشه‌ی قبلی («' + handle.name + '»)، «اتصال به پوشه قبلی» را بزنید');
        setFolderButtons('pending');
      });
    }).catch(function () {
      setFolderStatus('پوشه‌ای وصل نیست — فاکتورها فقط در همین مرورگر ذخیره می‌شوند');
      setFolderButtons('none');
    });
  }

  (function wireFolderBox() {
    var pickBtn = $('#btnPickFolder');
    var reconnectBtn = $('#btnReconnectFolder');
    var unlinkBtn = $('#btnUnlinkFolder');
    if (pickBtn) pickBtn.addEventListener('click', pickFolder);
    if (reconnectBtn) reconnectBtn.addEventListener('click', reconnectFolder);
    if (unlinkBtn) unlinkBtn.addEventListener('click', unlinkFolder);
  })();

  /* ───────────────── ذخیره‌سازی ───────────────── */

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    $('#saveStatus').textContent = 'در حال ذخیره…';
    $('#saveStatus').dataset.state = 'pending';
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        $('#saveStatus').textContent = 'تغییرات روی این دستگاه ذخیره شد';
        $('#saveStatus').dataset.state = 'saved';
      } catch (e) {
        $('#saveStatus').textContent = 'ذخیره نشد؛ از منوی فایل، فایل را ذخیره کنید';
        $('#saveStatus').dataset.state = 'error';
      }
    }, 250);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = restoreState(JSON.parse(raw));
    } catch (e) { /* از پیش‌فرض استفاده می‌شود */ }
  }

  /* ───────────────── راه‌اندازی ───────────────── */

  function buildMonthSelect() {
    ['#monthSelect', '#loadingMonthSelect'].forEach(function (selector) {
      var select = $(selector);
      if (!select) return;
      Jalali.MONTHS.forEach(function (name, i) {
        var opt = document.createElement('option');
        opt.value = String(i + 1);
        opt.textContent = name;
        select.appendChild(opt);
      });
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
    renderContactsDatalist();
    restoreFolderHandle();
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

/* ==========================================================================
   خروجی PDF و PNG
   برگه فاکتور با موتور خودِ مرورگر داخل یک تصویر SVG رندر می‌شود و سپس روی
   بوم (canvas) کشیده می‌شود. چون نتیجه یک تصویر با ابعاد دقیق A4 است، خروجی
   روی ویندوز، اندروید و آی‌پد کاملاً یکسان است و به موتور چاپ مرورگر
   وابسته نیست.
   ========================================================================== */
(function () {
  'use strict';

  var A4_W = 794;    // ۲۱۰ میلی‌متر در ۹۶dpi
  var A4_H = 1123;   // ۲۹۷ میلی‌متر در ۹۶dpi
  var PT_W = 595.28; // A4 بر حسب پوینت
  var PT_H = 841.89;
  var SCALE = 2.5;   // ~۲۴۰ نقطه بر اینچ

  var FONTS = [
    ['assets/fonts/Vazirmatn-Regular.woff2', 400],
    ['assets/fonts/Vazirmatn-Medium.woff2', 500],
    ['assets/fonts/Vazirmatn-SemiBold.woff2', 600],
    ['assets/fonts/Vazirmatn-Bold.woff2', 700],
    ['assets/fonts/Vazirmatn-ExtraBold.woff2', 800]
  ];

  var cache = {};

  /* ───────────────── ابزارهای پایه ───────────────── */

  function toDataUri(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('خواندن فایل ناموفق بود')); };
      reader.readAsDataURL(blob);
    });
  }

  function fetchDataUri(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('دریافت ' + url + ' ناموفق بود');
      return r.blob();
    }).then(toDataUri);
  }

  /** استایل‌های برنامه به‌همراه قلم‌های جاسازی‌شده (تصویر SVG به فایل بیرونی دسترسی ندارد) */
  function loadStyles() {
    if (cache.styles) return Promise.resolve(cache.styles);

    return Promise.all([
      fetch('assets/css/app.css').then(function (r) { return r.text(); }),
      Promise.all(FONTS.map(function (f) { return fetchDataUri(f[0]); }))
    ]).then(function (res) {
      var css = res[0].replace(/@font-face\s*\{[^}]*\}/g, '');

      var faces = FONTS.map(function (f, i) {
        return "@font-face{font-family:'Vazirmatn';src:url(" + res[1][i] +
          ") format('woff2');font-weight:" + f[1] + ";font-style:normal;font-display:block;}";
      }).join('');

      /* متغیرهای CSS روی :root تعریف شده‌اند و داخل foreignObject عنصر ریشه‌ای
         وجود ندارد، پس به کلاس پوشش تغییر نام می‌دهند */
      cache.styles = faces + css.replace(/:root/g, '.x-root');
      return cache.styles;
    });
  }

  function loadLogo() {
    if (cache.logo) return Promise.resolve(cache.logo);
    return fetchDataUri('assets/img/logo.svg').then(function (uri) {
      cache.logo = uri;
      return uri;
    });
  }

  /* ───────────────── ساخت تصویر از برگه ───────────────── */

  function buildSvg(styles, markup, width, height) {
    var wrapperStyle = [
      'width:' + width + 'px',
      'height:' + height + 'px',
      'background:#ffffff',
      "font-family:'Vazirmatn',Tahoma,sans-serif",
      'font-size:15px',
      'line-height:1.7',
      'color:#16211b',
      'color-scheme:only light'
    ].join(';');

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" ' +
      'viewBox="0 0 ' + width + ' ' + height + '">' +
      '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" class="x-root" dir="rtl" style="' + wrapperStyle + '">' +
      '<style>/*<![CDATA[*/' + styles + '/*]]>*/</style>' +
      markup +
      '</div></foreignObject></svg>';
  }

  /** نسخه‌ای از برگه که برای تصویر خروجی آماده شده است */
  function cloneSheet(logoUri) {
    var source = document.getElementById('sheet');
    var clone = source.cloneNode(true);

    clone.style.position = 'static';
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.borderRadius = '0';
    clone.style.boxShadow = 'none';
    clone.style.width = A4_W + 'px';
    clone.style.minHeight = A4_H + 'px';
    clone.removeAttribute('id');

    Array.prototype.forEach.call(clone.querySelectorAll('img'), function (img) {
      img.setAttribute('src', logoUri);
    });

    return {
      markup: new XMLSerializer().serializeToString(clone),
      height: Math.max(A4_H, Math.ceil(source.offsetHeight))
    };
  }

  function renderCanvas() {
    return Promise.all([loadStyles(), loadLogo()]).then(function (res) {
      var sheet = cloneSheet(res[1]);
      var svg = buildSvg(res[0], sheet.markup, A4_W, sheet.height);
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(A4_W * SCALE);
          canvas.height = Math.round(sheet.height * SCALE);

          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          if (isBlank(ctx, canvas)) {
            reject(new Error('رندر تصویر ناموفق بود'));
            return;
          }
          resolve(canvas);
        };
        img.onerror = function () { reject(new Error('بارگذاری تصویر ناموفق بود')); };
        img.src = url;
      });
    });
  }

  /** اگر مرورگر foreignObject را رندر نکند، بوم کاملاً سفید می‌ماند.
      چند سطر در ارتفاع‌های مختلف بررسی می‌شود چون بخش‌هایی از برگه سفیدند. */
  function isBlank(ctx, canvas) {
    for (var step = 1; step <= 16; step++) {
      var y = Math.min(canvas.height - 1, Math.round(canvas.height * step / 17));
      var row = ctx.getImageData(0, y, canvas.width, 1).data;
      for (var i = 0; i < row.length; i += 4) {
        if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) return false;
      }
    }
    return true;
  }

  /* ───────────────── ساخت فایل PDF ───────────────── */

  function base64ToBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /** یک PDF کمینه که تصویر JPEG را در قطع A4 جای می‌دهد */
  function buildPdf(jpeg, imgW, imgH) {
    var drawH = PT_W * imgH / imgW;
    var pageCount = Math.max(1, Math.ceil((drawH - 0.5) / PT_H));

    var encoder = new TextEncoder();
    var chunks = [];
    var offsets = [];
    var position = 0;

    function put(data) {
      var bytes = typeof data === 'string' ? encoder.encode(data) : data;
      chunks.push(bytes);
      position += bytes.length;
    }

    function startObject(id) {
      offsets[id] = position;
      put(id + ' 0 obj\n');
    }

    var IMAGE_ID = 3;
    var pageIds = [];
    var contentIds = [];
    for (var i = 0; i < pageCount; i++) {
      pageIds.push(4 + i * 2);
      contentIds.push(5 + i * 2);
    }
    var totalObjects = 3 + pageCount * 2;

    put('%PDF-1.4\n');
    put(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

    startObject(1);
    put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    startObject(2);
    put('<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') +
      '] /Count ' + pageCount + ' >>\nendobj\n');

    startObject(IMAGE_ID);
    put('<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    put(jpeg);
    put('\nendstream\nendobj\n');

    for (var p = 0; p < pageCount; p++) {
      /* تصویر طوری جابه‌جا می‌شود که برش مربوط به این صفحه در کادر صفحه بیفتد */
      var ty = PT_H * (p + 1) - drawH;
      var content = 'q\n' + PT_W.toFixed(2) + ' 0 0 ' + drawH.toFixed(2) + ' 0 ' + ty.toFixed(2) +
        ' cm\n/Im0 Do\nQ\n';

      startObject(pageIds[p]);
      put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PT_W + ' ' + PT_H + ']' +
        ' /Resources << /XObject << /Im0 ' + IMAGE_ID + ' 0 R >> >>' +
        ' /Contents ' + contentIds[p] + ' 0 R >>\nendobj\n');

      startObject(contentIds[p]);
      put('<< /Length ' + encoder.encode(content).length + ' >>\nstream\n' + content + 'endstream\nendobj\n');
    }

    var xrefStart = position;
    var xref = 'xref\n0 ' + (totalObjects + 1) + '\n0000000000 65535 f \n';
    for (var id = 1; id <= totalObjects; id++) {
      xref += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
    }
    put(xref);
    put('trailer\n<< /Size ' + (totalObjects + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n');

    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* ───────────────── دانلود ───────────────── */

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function fileName(extension) {
    var input = document.querySelector('[data-path="invoice.number"]');
    var number = (input && input.value.trim()) || 'new';
    return 'faktor-' + number.replace(/[^\w؀-ۿ-]/g, '') + '.' + extension;
  }

  /* ───────────────── وضعیت دکمه‌ها ───────────────── */

  var busy = false;

  function withBusy(button, task) {
    if (busy) return;
    busy = true;

    var label = button.querySelector('.btn__label');
    var original = label ? label.textContent : '';
    if (label) label.textContent = 'در حال ساخت…';
    button.disabled = true;
    button.classList.add('is-busy');

    task()
      .catch(function (error) {
        console.error(error);
        alert('ساخت فایل روی این مرورگر ممکن نشد.\nاز دکمه «چاپ» استفاده کنید.');
      })
      .then(function () {
        busy = false;
        button.disabled = false;
        button.classList.remove('is-busy');
        if (label) label.textContent = original;
      });
  }

  function exportPdf(button) {
    withBusy(button, function () {
      return renderCanvas().then(function (canvas) {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.94);
        var jpeg = base64ToBytes(dataUrl.split(',')[1]);
        download(buildPdf(jpeg, canvas.width, canvas.height), fileName('pdf'));
      });
    });
  }

  function exportPng(button) {
    withBusy(button, function () {
      return renderCanvas().then(function (canvas) {
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) {
            download(blob, fileName('png'));
            resolve();
          }, 'image/png');
        });
      });
    });
  }

  /* ───────────────── راه‌اندازی ───────────────── */

  function init() {
    var pdfButton = document.getElementById('btnPdf');
    var pngButton = document.getElementById('btnPng');
    if (pdfButton) pdfButton.addEventListener('click', function () { exportPdf(pdfButton); });
    if (pngButton) pngButton.addEventListener('click', function () { exportPng(pngButton); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

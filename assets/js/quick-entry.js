/* ورود سریع آفلاین: فقط داده‌های صریح یک فاکتور؛ بدون حدس درباره مقادیر خالی. */
(function (global) {
  'use strict';

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var NUMBER = '[+\\-]?\\d+(?:(?:[,.]\\d+)|(?:[ \\t]\\d{3}(?!\\d)))*';
  var KG = '(?:کیلو\\s*گرم|کیلو|kg)';
  var PRICE_LABEL = '(?:از\\s+قرار\\s+)?(?:کیلویی|کیلوئی|قیمت\\s+(?:هر\\s+)?کیلو(?:\\s*گرم)?|نرخ\\s+(?:هر\\s+)?کیلو(?:\\s*گرم)?)';
  var WEEKDAY = '(?:پنج\\s*شنبه|چهار\\s*شنبه|سه\\s*شنبه|دو\\s*شنبه|یک\\s*شنبه|شنبه|جمعه)';
  var DATE_FILLER = '(?:(?:در|روز)\\s+)*(?:' + WEEKDAY + '\\s+)?';

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06f0); })
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/٬/g, ',').replace(/٫/g, '.').replace(/−/g, '-')
      .replace(/[\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .replace(/[\u00a0\u202f]/g, ' ')
      .replace(/\r?\n/g, ' ؛ ').replace(/[ \t]+/g, ' ').trim();
  }

  function parse(input, context) {
    var text = normalize(input);
    var result = { errors: [], warnings: [] };
    var used = [];
    var dates = { issueDate: [], loadingDate: [] };
    var prices = [];
    var weights = [];

    function error(message) {
      if (result.errors.indexOf(message) < 0) result.errors.push(message);
    }
    function mark(start, end) { used.push({ start: start, end: end }); }
    function remaining() {
      return text.split('').map(function (c, i) {
        return used.some(function (span) { return i >= span.start && i < span.end; }) ? ' ' : c;
      }).join('');
    }
    function matches(re, source, callback) {
      var match;
      while ((match = re.exec(source))) callback(match);
    }
    function number(raw, label, decimals) {
      var clean = raw.replace(/[ \t]/g, ',');
      if (!/^[+\-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(clean)) {
        error('جداکننده‌های عدد «' + label + '» معتبر نیست.');
        return null;
      }
      var value = Number(clean.replace(/,/g, ''));
      if (!isFinite(value) || Math.abs(value) > 9007199254740991 || value < 0 ||
          (clean.split('.')[1] || '').length > decimals) {
        error('عدد «' + label + '» معتبر نیست.');
        return null;
      }
      return value;
    }
    function dateValue(y, m, d) {
      if (y === undefined) {
        y = context && context.year;
        if (y === undefined || y === null || y === '') {
          error('سال تاریخ مشخص نیست؛ سال را در متن بنویسید.');
          return null;
        }
      }
      y = Number(normalize(y)); m = Number(m); d = Number(d);
      if (!global.Jalali || typeof global.Jalali.isValid !== 'function') {
        error('اعتبارسنجی تاریخ در دسترس نیست.');
        return null;
      }
      if (Math.floor(y) !== y || Math.floor(m) !== m || Math.floor(d) !== d ||
          !global.Jalali.isValid(y, m, d)) {
        error('تاریخ واردشده معتبر نیست.');
        return null;
      }
      return { y: y, m: m, d: d };
    }
    function addDate(match, dateStart, dateEnd, y, m, d) {
      var prefix = remaining().slice(0, dateStart);
      var label = new RegExp('((?:تاریخ\\s*)?بارگیری|(?:تاریخ\\s*)?صدور|تاریخ)\\s*[:：-]?\\s*' + DATE_FILLER + '$').exec(prefix);
      var filler = !label && new RegExp('(?:(?:در|روز)\\s+)+(?:' + WEEKDAY + '\\s+)?$|' + WEEKDAY + '\\s+$').exec(prefix);
      // تاریخ بدون برچسب، تاریخ صدور است. فقط «بارگیری» معنای آن را عوض می‌کند.
      var key = label && /بارگیری/.test(label[1]) ? 'loadingDate' : 'issueDate';
      var value = dateValue(y, m, d);
      dates[key].push(value);
      mark(label ? label.index : filler ? filler.index : dateStart, dateEnd);
    }

    if (!text) {
      result.errors.push('متن فاکتور را وارد کنید.');
      return result;
    }

    // تاریخ عددی فقط با ترتیب روشن سال/ماه/روز پذیرفته می‌شود.
    matches(/(^|[^\d])([+\-]?\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)(?!\d)/g, remaining(), function (m) {
      addDate(m, m.index + m[1].length, m.index + m[0].length, m[2], m[3], m[4]);
    });
    var namedDate = new RegExp('(^|[^\\d])([+\\-]?\\d+)\\s+(' + MONTHS.join('|') +
      ')(?=\\s|[،,؛;:]|$)(?:\\s+(?:سال\\s+)?(\\d{4})(?!\\d)(?!\\s*(?:تن|' + KG + ')))?', 'g');
    matches(namedDate, remaining(), function (m) {
      addDate(m, m.index + m[1].length, m.index + m[0].length,
        m[4] === undefined ? undefined : m[4], MONTHS.indexOf(m[3]) + 1, m[2]);
    });
    ['issueDate', 'loadingDate'].forEach(function (key) {
      if (dates[key].length > 1) error('بیش از یک تاریخ ' + (key === 'issueDate' ? 'صدور' : 'بارگیری') + ' پیدا شد؛ هر بار فقط یک فاکتور وارد کنید.');
      else if (dates[key][0]) result[key] = dates[key][0];
    });

    var pricePattern = new RegExp(PRICE_LABEL + '\\s*[:：=]?\\s*(' + NUMBER + ')', 'g');
    matches(pricePattern, remaining(), function (m) {
      prices.push(number(m[1], 'قیمت هر کیلو', 2));
      mark(m.index, m.index + m[0].length);
    });
    if (prices.length > 1) error('بیش از یک قیمت پیدا شد؛ هر بار فقط یک فاکتور وارد کنید.');
    else if (prices[0] !== undefined && prices[0] !== null) {
      if (prices[0] === 0) error('قیمت هر کیلو باید بیشتر از صفر باشد.');
      else result.price = prices[0];
    }

    var tonPattern = new RegExp('(^|[\\s:،,؛;])(' + NUMBER + ')\\s*تن(?=\\s|[،,؛;:]|$)' +
      '(?:\\s*(?:و\\s*)?(' + NUMBER + ')(?!\\s*تن)(?:\\s*' + KG + '(?=\\s|[،,؛;:]|$))?)?', 'gi');
    matches(tonPattern, remaining(), function (m) {
      var tons = number(m[2], 'وزن تن', 3);
      var rest = m[3] === undefined ? 0 : number(m[3], 'وزن کیلوگرم', 3);
      if (rest !== null && rest >= 1000) {
        error('بخش کیلوگرم پس از تن باید کمتر از ۱۰۰۰ باشد.');
        rest = null;
      }
      weights.push(tons === null || rest === null ? null : Math.round((tons * 1000 + rest) * 1000) / 1000);
      mark(m.index + m[1].length, m.index + m[0].length);
    });
    var kgPattern = new RegExp('(^|[\\s:،,؛;])(' + NUMBER + ')\\s*' + KG + '(?=\\s|[،,؛;:]|$)', 'gi');
    matches(kgPattern, remaining(), function (m) {
      weights.push(number(m[2], 'وزن کیلوگرم', 3));
      mark(m.index + m[1].length, m.index + m[0].length);
    });
    if (weights.length > 1) error('بیش از یک وزن یا بارگیری پیدا شد؛ هر بار فقط یک فاکتور وارد کنید.');
    else if (weights[0] !== undefined && weights[0] !== null) {
      if (!isFinite(weights[0]) || weights[0] > 9007199254740991 || weights[0] <= 0) error('وزن باید یک عدد معتبر و بیشتر از صفر باشد.');
      else result.weightKg = weights[0];
    }

    var currencies = [];
    matches(/(^|[\s\d،,؛;:])(تومان|ریال)(?=$|[\s،,؛;:.!?؟])/g, remaining(), function (m) {
      if (currencies.indexOf(m[2]) < 0) currencies.push(m[2]);
      mark(m.index + m[1].length, m.index + m[0].length);
    });
    if (currencies.length > 1) error('هر دو واحد تومان و ریال آمده است؛ واحد قیمت را مشخص کنید.');
    else if (currencies.length) result.currency = currencies[0];

    matches(/خوراک\s+تخمیری/g, remaining(), function (m) {
      result.description = 'خوراک تخمیری';
      mark(m.index, m.index + m[0].length);
    });

    // نام فقط از ابتدای جمله یا پس از برچسب روشن خریدار استخراج می‌شود.
    var buyerLabels = [];
    matches(/(?:نام\s+)?(?:خریدار|مشتری)\s*[:：]?\s*/g, remaining(), function (m) { buyerLabels.push(m); });
    if (buyerLabels.length > 1) error('بیش از یک خریدار پیدا شد؛ هر بار فقط یک فاکتور وارد کنید.');
    else {
      var buyerStart = buyerLabels.length ? buyerLabels[0].index + buyerLabels[0][0].length : 0;
      var next = used.filter(function (span) { return span.start >= buyerStart; })
        .sort(function (a, b) { return a.start - b.start; })[0];
      var buyerEnd = next ? next.start : text.length;
      var part = text.slice(buyerStart, buyerEnd);
      var stop = part.search(/[،؛;\n]/);
      if (stop >= 0) { buyerEnd = buyerStart + stop; part = part.slice(0, stop); }
      var buyer = part.replace(/^(?:برای|واسه)\s+/, '')
        .replace(/(?:\s+(?:وزن|خالص|در|روز|تاریخ|و|بارگیری|شده|پنجشنبه|پنج شنبه|شنبه|یکشنبه|دوشنبه|سه شنبه|چهارشنبه|جمعه))+\s*[:：]?\s*$/, '')
        .replace(/^[\s:：,]+|[\s:：,]+$/g, '');
      if (buyer && buyer.length <= 80 && !/[\d/=]/.test(buyer) &&
          !/(?:وزن|قیمت|کیلو|تن(?:\s|$)|تاریخ|بارگیری|صدور|میلیون|هزار)/.test(buyer) &&
          !new RegExp('^(?:در|روز|و|' + WEEKDAY + ')$').test(buyer) &&
          /^[A-Za-z\u0621-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc][A-Za-z\u0621-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc .'-]*$/.test(buyer)) {
        result.buyerName = buyer;
        mark(buyerLabels.length ? buyerLabels[0].index : buyerStart, buyerEnd);
      } else if (buyerLabels.length) error('نام خریدار پس از برچسب مشخص نیست.');
    }

    var rest = remaining();
    if (new RegExp(MONTHS.join('|')).test(rest) || /تاریخ\s*(?:بارگیری|صدور)|تاریخ|صدور/.test(rest)) {
      error('یک تاریخ کامل شناسایی نشد؛ از «۹ مهر» یا «۱۴۰۵/۰۷/۰۹» استفاده کنید.');
    }
    if (/بارگیری/.test(rest)) error('تاریخ بارگیری روشن نیست؛ تاریخ را پس از واژه «بارگیری» بنویسید.');
    if (new RegExp(PRICE_LABEL).test(rest)) error('قیمت هر کیلو شناسایی نشد؛ قیمت را با رقم بنویسید.');
    if (/(?:^|[\s،؛;])(تن|کیلو\s*گرم|کیلو|kg)(?=\s|[،؛;]|$)/i.test(rest) || (!weights.length && /وزن/.test(rest))) {
      error('وزن کامل شناسایی نشد؛ وزن را با رقم و واحد بنویسید.');
    }
    if (/هزار|میلیون|میلیارد/.test(rest)) error('مبالغ و وزن را کامل با رقم بنویسید؛ مانند ۲۱٬۰۰۰.');
    if (/\d/.test(rest)) error('عدد دیگری در متن هست که معنایش روشن نیست؛ تاریخ، وزن و قیمت را مشخص کنید.');
    rest = rest.replace(/(?:^|\s)(?:روز|پنج\s*شنبه|چهار\s*شنبه|سه\s*شنبه|دو\s*شنبه|یک\s*شنبه|شنبه|جمعه|وزن|خالص|بارگیری|شده|برای|از|قرار|و|با|در|به)(?=\s|$)/g, ' ')
      .replace(/[\s،,؛;:.!?؟]+/g, ' ').trim();
    if (rest && !result.errors.length) result.warnings.push('بخشی از متن شناسایی نشد: «' + rest + '».');
    if (Object.keys(result).length === 2 && !result.errors.length) error('اطلاعات قابل استفاده‌ای در متن شناسایی نشد.');
    if (!result.buyerName) result.warnings.push('نام خریدار در متن مشخص نیست.');
    if (result.weightKg === undefined) result.warnings.push('وزن در متن مشخص نیست.');
    if (result.price === undefined) result.warnings.push('قیمت هر کیلو در متن مشخص نیست.');
    return result;
  }

  global.QuickEntry = { parse: parse };
})(window);

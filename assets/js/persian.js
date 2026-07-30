/* ابزارهای فارسی: ارقام، جداکننده هزارگان و تبدیل عدد به حروف */
(function (global) {
  'use strict';

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  var ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  var TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  var TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  var HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  var SCALES = ['', ' هزار', ' میلیون', ' میلیارد', ' هزار میلیارد', ' میلیون میلیارد'];

  /** ارقام فارسی و عربی را به ارقام لاتین تبدیل می‌کند */
  function toLatinDigits(input) {
    return String(input == null ? '' : input)
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
  }

  /** ارقام لاتین را به ارقام فارسی تبدیل می‌کند */
  function toFaDigits(input) {
    return String(input == null ? '' : input).replace(/\d/g, function (d) { return FA_DIGITS[+d]; });
  }

  /** هر ورودی کاربر را به عدد تبدیل می‌کند (با پشتیبانی از ارقام فارسی و کاما) */
  function parseNum(input) {
    if (typeof input === 'number') return isFinite(input) ? input : 0;
    var clean = toLatinDigits(input).replace(/[,٬\s]/g, '').replace(/[^\d.\-]/g, '');
    var n = parseFloat(clean);
    return isFinite(n) ? n : 0;
  }

  /** جداکننده هزارگان با ارقام فارسی */
  function formatMoney(value) {
    var n = parseNum(value);
    var neg = n < 0;
    var abs = Math.abs(n);
    var rounded = Math.round(abs * 100) / 100;
    var intPart = Math.floor(rounded);
    var frac = Math.round((rounded - intPart) * 100);
    var out = toFaDigits(intPart.toLocaleString('en-US'));
    if (frac > 0) out += '/' + toFaDigits(String(frac).padStart(2, '0'));
    return (neg ? '−' : '') + out;
  }

  /** نمایش اعداد وزنی (تا سه رقم اعشار، بدون صفر اضافه) */
  function formatQty(value) {
    var n = parseNum(value);
    var rounded = Math.round(n * 1000) / 1000;
    var parts = String(Math.abs(rounded)).split('.');
    var out = toFaDigits(Number(parts[0]).toLocaleString('en-US'));
    if (parts[1]) out += '/' + toFaDigits(parts[1]);
    return (n < 0 ? '−' : '') + out;
  }

  function threeDigitsToWords(n) {
    var parts = [];
    var h = Math.floor(n / 100);
    var rest = n % 100;
    if (h > 0) parts.push(HUNDREDS[h]);
    if (rest >= 10 && rest <= 19) {
      parts.push(TEENS[rest - 10]);
    } else {
      var t = Math.floor(rest / 10);
      var o = rest % 10;
      if (t > 0) parts.push(TENS[t]);
      if (o > 0) parts.push(ONES[o]);
    }
    return parts.join(' و ');
  }

  /** عدد را به حروف فارسی برمی‌گرداند */
  function numberToWords(value) {
    var n = Math.round(Math.abs(parseNum(value)));
    var neg = parseNum(value) < 0;
    if (n === 0) return 'صفر';

    var groups = [];
    while (n > 0) {
      groups.push(n % 1000);
      n = Math.floor(n / 1000);
    }

    var words = [];
    for (var i = groups.length - 1; i >= 0; i--) {
      if (groups[i] === 0) continue;
      words.push(threeDigitsToWords(groups[i]) + (SCALES[i] || ''));
    }

    return (neg ? 'منفی ' : '') + words.join(' و ');
  }

  global.Fa = {
    toFaDigits: toFaDigits,
    toLatinDigits: toLatinDigits,
    parseNum: parseNum,
    formatMoney: formatMoney,
    formatQty: formatQty,
    numberToWords: numberToWords
  };
})(window);

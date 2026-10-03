const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/jalali.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/quick-entry.js'), 'utf8'), context);
function parse(text, options = { year: 1405 }) {
  return JSON.parse(JSON.stringify(context.window.QuickEntry.parse(text, options)));
}
function valid(text, options) {
  const result = parse(text, options);
  assert.deepEqual(result.errors, [], JSON.stringify(result));
  return result;
}

test('the exact unpunctuated Persian example uses the date as issue date', () => {
  const result = valid('اسدبهار ۹ مهر ۲ تن و ۶۹۰ و کیلویی ۲۱۰۰۰');
  assert.equal(result.buyerName, 'اسدبهار');
  assert.equal(result.weightKg, 2690);
  assert.equal(result.price, 21000);
  assert.deepEqual(result.issueDate, { y: 1405, m: 7, d: 9 });
  assert.equal(result.loadingDate, undefined);
  assert.equal(result.currency, undefined);
  assert.equal(result.description, undefined);
});

test('only a loading label supplies loadingDate, independently of issueDate', () => {
  const loading = valid('اسدبهار بارگیری ۹ مهر ۲ تن و ۶۹۰ و کیلویی ۲۱۰۰۰');
  assert.deepEqual(loading.loadingDate, { y: 1405, m: 7, d: 9 });
  assert.equal(loading.issueDate, undefined);
  const both = valid('خریدار: اسدبهار؛ تاریخ صدور ۱۴۰۵/۰۷/۱۱؛ تاریخ بارگیری ۹ مهر؛ ۲۶۹۰ کیلو؛ قیمت هر کیلو ۲۱٬۰۰۰ تومان');
  assert.deepEqual(both.issueDate, { y: 1405, m: 7, d: 11 });
  assert.deepEqual(both.loadingDate, { y: 1405, m: 7, d: 9 });
  assert.equal(both.currency, 'تومان');
});

test('weekday and date filler preserve routing and are never buyer names', () => {
  for (const prefix of ['بارگیری روز', 'بارگیری پنجشنبه', 'تاریخ بارگیری در روز پنج شنبه']) {
    const result = valid(`اسدبهار ${prefix} ۹ مهر ۲ تن و ۶۹۰ و کیلویی ۲۱۰۰۰`);
    assert.equal(result.buyerName, 'اسدبهار');
    assert.deepEqual(result.loadingDate, { y: 1405, m: 7, d: 9 });
    assert.equal(result.issueDate, undefined);
  }
  for (const prefix of ['پنجشنبه', 'روز پنجشنبه', 'در', 'تاریخ', 'در تاریخ']) {
    const result = valid(`${prefix} ۹ مهر ۲ تن کیلویی ۲۱۰۰۰`);
    assert.equal(result.buyerName, undefined, prefix);
    assert.deepEqual(result.issueDate, { y: 1405, m: 7, d: 9 });
    assert.equal(result.loadingDate, undefined);
  }
  assert.ok(parse('اسدبهار ۹ مهر بارگیری شده ۲ تن کیلویی ۲۱۰۰۰').errors.length);
});

test('currency is a complete token and cannot consume a surname', () => {
  const result = valid('آقای ریالی ۹ مهر ۲ تن کیلویی ۲۱۰۰۰');
  assert.equal(result.buyerName, 'آقای ریالی');
  assert.equal(result.currency, undefined);
  assert.equal(valid('آقای ریالی ۹ مهر ۲ تن کیلویی ۲۱۰۰۰ریال').currency, 'ریال');
});

test('Arabic and Latin digits, grouped money, kg, and an explicit description work', () => {
  const result = valid('آقای رشدی ١٤٠٥/٠٧/٠٩ وزن ٢٬٦٩٠ کیلوگرم از قرار کیلویی 15,700 تومان خوراک تخمیری');
  assert.equal(result.buyerName, 'آقای رشدی');
  assert.equal(result.weightKg, 2690);
  assert.equal(result.price, 15700);
  assert.equal(result.description, 'خوراک تخمیری');
  assert.deepEqual(result.issueDate, { y: 1405, m: 7, d: 9 });
});

test('all Persian months and explicit year are accepted', () => {
  for (const [i, month] of context.window.Jalali.MONTHS.entries()) {
    assert.deepEqual(valid(`خریدار: رشدی؛ 9 ${month} 1404؛ 100 kg کیلویی 15000 ریال`).issueDate,
      { y: 1404, m: i + 1, d: 9 });
  }
});

test('decimal tons, explicit kg remainder, and space-grouped numbers are precise', () => {
  assert.equal(valid('رشدی ۹ مهر ۲٫۶۹ تن کیلویی ۱۵۷۰۰').weightKg, 2690);
  assert.equal(valid('رشدی ۹ مهر ۲ تن و ۶۹۰ کیلوگرم کیلویی ۱۵۷۰۰').weightKg, 2690);
  const result = valid('رشدی ۹ مهر 2 690 کیلو قیمت هر کیلو 21 000');
  assert.equal(result.weightKg, 2690);
  assert.equal(result.price, 21000);
});

test('missing fields are absent and never borrow numbers from a date', () => {
  const result = valid('۹ مهر');
  assert.deepEqual(result.issueDate, { y: 1405, m: 7, d: 9 });
  for (const key of ['buyerName', 'weightKg', 'price', 'loadingDate', 'currency', 'description']) {
    assert.equal(result[key], undefined, key);
  }
  assert.ok(result.warnings.length);
  const onlyPrice = valid('کیلویی ۲۱۰۰۰');
  assert.equal(onlyPrice.price, 21000);
  assert.equal(onlyPrice.weightKg, undefined);
  assert.equal(onlyPrice.buyerName, undefined);
  const onlyName = valid('اسدبهار');
  assert.equal(onlyName.buyerName, 'اسدبهار');
  assert.equal(onlyName.weightKg, undefined);
  assert.equal(onlyName.price, undefined);
  for (const text of ['', '  ', '؛،:', '!!!']) assert.ok(parse(text).errors.length, text);
});

test('implicit year requires context and explicit year needs no context', () => {
  assert.ok(parse('۹ مهر', {}).errors.length);
  assert.equal(parse('۹ مهر', {}).issueDate, undefined);
  assert.deepEqual(valid('۱۴۰۵/۷/۹', {}).issueDate, { y: 1405, m: 7, d: 9 });
  assert.ok(parse('۹ مهر', { year: 1405.5 }).errors.length);
});

test('invalid calendar dates and incomplete dates are refused', () => {
  for (const text of ['۳۱ مهر', '۱۴۰۵/۱۳/۱', '۱۴۰۵/۷/۳۲', '۱۴۰۴/۱۲/۳۰', '۹۹ مهر', 'تاریخ صدور مهر', '۹/۷/۱۴۰۵']) {
    assert.ok(parse(text).errors.length, text);
    assert.equal(parse(text).issueDate, undefined, text);
  }
});

test('multiple deliveries, conflicting dates, and conflicting units are not merged', () => {
  for (const text of [
    'رشدی ۹ مهر ۲ تن کیلویی ۱۵۷۰۰؛ ۱۰ مهر ۳ تن کیلویی ۱۶۰۰۰',
    'رشدی ۹ مهر ۲۶۹۰ کیلو و ۳۰۰۰ کیلو کیلویی ۱۵۷۰۰',
    'رشدی ۹ مهر ۲ تن کیلویی ۱۵۷۰۰ و کیلویی ۱۶۰۰۰',
    'رشدی ۹ مهر ۲ تن کیلویی ۱۵۷۰۰ تومان ریال',
    'رشدی بارگیری ۹ مهر و بارگیری ۱۰ مهر ۲ تن کیلویی ۱۵۷۰۰'
  ]) assert.ok(parse(text).errors.length, text);
  assert.equal(parse('رشدی ۹ مهر و ۱۰ مهر ۲ تن کیلویی ۱۵۷۰۰').issueDate, undefined);
});

test('malformed, negative, zero, unsafe, and unexplained numbers cannot silently apply', () => {
  for (const text of [
    'رشدی ۹ مهر ۲ تن کیلویی ۲۱,۰۰',
    'رشدی ۹ مهر -۲ تن کیلویی ۱۵۷۰۰',
    'رشدی ۹ مهر ۲ تن کیلویی -۱۵۷۰۰',
    'رشدی ۹ مهر ۰ کیلو کیلویی ۱۵۷۰۰',
    'رشدی ۹ مهر ۲ تن کیلویی ۰',
    'رشدی ۹ مهر ۲ تن و ۱۰۰۰ کیلویی ۱۵۷۰۰',
    'رشدی ۹ مهر دو تن کیلویی ۱۵۷۰۰',
    'رشدی ۹ مهر ۲ تن کیلویی ۲۱ هزار',
    'رشدی ۹ مهر ۲ تن کیلویی ۲۱.۰۰۰',
    'رشدی ۹ مهر ۲۶۹۰ ۱۵۷۰۰',
    'رشدی ۹ مهر ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۲ کیلو کیلویی ۱۵۷۰۰'
  ]) assert.ok(parse(text).errors.length, text);
});

test('an unlabelled kilogram count after a named date is not mistaken for its year', () => {
  const result = valid('رشدی ۹ مهر ۲۶۹۰ کیلو کیلویی ۱۵۷۰۰');
  assert.equal(result.weightKg, 2690);
  assert.deepEqual(result.issueDate, { y: 1405, m: 7, d: 9 });
});

test('invalid dates fail closed without the Jalali validator', () => {
  const isolated = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/quick-entry.js'), 'utf8'), isolated);
  assert.ok(isolated.window.QuickEntry.parse('۱۴۰۵/۷/۹', {}).errors.length);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scope = 'https://qaradagh.github.io/Sales-invoice/';
function worker(overrides = {}) {
  const events = {};
  const deleted = [];
  const opened = [];
  const context = {
    URL,
    self: { registration: { scope }, location: { origin: new URL(scope).origin },
      addEventListener: (name, handler) => { events[name] = handler; },
      clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches: {
      keys: async () => ['faktor-v6', 'unrelated-app', 'sales-invoice-2-https://qaradagh.github.io/Sales-invoice-2/-v2.1.1', 'sales-invoice-main-https://example.com/-old', 'sales-invoice-main-' + scope + '-old', context.CACHE],
      delete: async key => { deleted.push(key); },
      open: async key => { opened.push(key); return { match: async () => 'original-app-only', addAll: async () => {} }; }
    },
    fetch: async () => { throw new Error('offline'); },
    ...overrides
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
  return { context, events, deleted, opened };
}
test('updating the original app only removes outdated caches owned by its own scope', async () => {
  const w = worker();
  let done;
  w.events.activate({ waitUntil: p => { done = p; } });
  await done;
  assert.deepEqual(w.deleted, ['sales-invoice-main-' + scope + '-old']);
});
test('offline navigation uses only its own cache', async () => {
  const w = worker();
  let response;
  w.events.fetch({ request: { method: 'GET', url: scope, mode: 'navigate' }, respondWith: p => { response = p; } });
  assert.equal(await response, 'original-app-only');
  assert.ok(w.opened.every(key => key.startsWith('sales-invoice-main-' + scope)));
});
test('offline shell includes every local dependency, including compact navigation', () => {
  const { context } = worker();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cached = new Set(context.SHELL.map(file => new URL(file, scope).href));
  for (const [, resource] of html.matchAll(/(?:src|href)="((?:assets\/|manifest\.)[^"#]+)"/g)) {
    assert.ok(cached.has(new URL(resource, scope).href), 'Missing offline dependency: ' + resource);
  }
  const exporter = fs.readFileSync(path.join(root, 'assets/js/export.js'), 'utf8');
  const exportStyles = exporter.match(/fetch\('(assets\/css\/[^']+)'\)/)[1];
  assert.ok(cached.has(new URL(exportStyles, scope).href), 'Missing export stylesheet');
  for (const file of context.SHELL) assert.ok(fs.existsSync(path.join(root, file.split('?')[0])), file);
});
test('existing drafts, archives, contacts, preferences, and installed app identity are preserved', () => {
  const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  const keys = [...app.matchAll(/var (?:STORAGE_KEY|THEME_KEY|ZOOM_KEY|ARCHIVE_KEY|CONTACTS_KEY|FOLDER_DB_NAME) = '([^']+)'/g)].map(m => m[1]);
  assert.equal(keys.length, 6);
  assert.equal(new Set(keys).size, 6);
  assert.deepEqual(keys, ['shilan-invoice-v1', 'shilan-invoice-theme', 'shilan-invoice-zoom', 'shilan-invoice-archive-v1', 'shilan-invoice-contacts-v1', 'shilan-invoice-fs']);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(new URL(manifest.id, scope).href, scope + 'shilan-sales-invoice');
});

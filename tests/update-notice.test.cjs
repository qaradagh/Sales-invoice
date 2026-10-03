const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const pwaSource = fs.readFileSync(path.join(root, 'assets/js/pwa.js'), 'utf8');
const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const seenKey = 'shilan-invoice-app-version';
const dismissedKey = 'shilan-invoice-update-dismissed-version';

function target() {
  const listeners = {};
  return {
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    emit(type, event = {}) { for (const handler of listeners[type] || []) handler(event); }
  };
}
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}
function worker(version) {
  const messages = [];
  return Object.assign(target(), {
    state: 'installed', messages,
    postMessage(data, ports) {
      messages.push(data.type);
      if (data.type === 'GET_VERSION') ports[0].postMessage({ type: 'VERSION', version });
    }
  });
}
function page(options = {}) {
  const nodes = {};
  function element(id = '') {
    const el = Object.assign(target(), {
      id, hidden: false, checked: false, disabled: false, textContent: '', value: '',
      setAttribute() {}, appendChild(child) { if (child.id) nodes[child.id] = child; }
    });
    Object.defineProperty(el, 'innerHTML', { set(html) {
      for (const [, childId] of html.matchAll(/id="([^"]+)"/g)) nodes[childId] = element(childId);
    } });
    if (id) nodes[id] = el;
    return el;
  }
  element('appVersion');
  element('quickEntryText');
  const document = Object.assign(target(), {
    readyState: 'loading', visibilityState: 'visible', body: element(),
    getElementById: id => nodes[id] || null, createElement: () => element()
  });
  const registration = Object.assign(target(), {
    waiting: options.waiting || null, installing: null, updates: 0,
    update() { this.updates++; return options.offline ? Promise.reject(new Error('offline')) : Promise.resolve(); }
  });
  const serviceWorker = Object.assign(target(), {
    controller: null,
    register(url, opts) { this.registrationArgs = [url, opts]; return Promise.resolve(registration); }
  });
  const location = { href: options.url || 'https://example.com/app/', protocol: 'https:', reload() { reloads++; } };
  const window = Object.assign(target(), {
    matchMedia: () => ({ matches: false }),
    history: { state: null, replaceState(state, title, href) { location.href = href; } },
    Invoice: { flushSave: () => { flushes++; return options.saveSucceeds !== false; } }
  });
  const localStorage = options.localStorage || storage(options.stored);
  const sessionStorage = options.sessionStorage || storage();
  const timers = new Map();
  let nextTimer = 0, reloads = 0, flushes = 0;
  class MessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = { postMessage: data => this.port1.onmessage({ data }), close() {} };
    }
  }
  const context = {
    window, document, navigator: { userAgent: 'test', platform: 'test', serviceWorker, onLine: !options.offline },
    location,
    localStorage, sessionStorage, URL, MessageChannel, console,
    setTimeout: (handler, delay) => { const id = ++nextTimer; timers.set(id, { handler, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(pwaSource, context);
  window.emit('load');
  return { nodes, window, document, location, registration, serviceWorker, localStorage, sessionStorage, timers,
    get reloads() { return reloads; }, get flushes() { return flushes; } };
}
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

test('old query or saved version announces the already-loaded release without reloading', async () => {
  for (const options of [{ url: 'https://example.com/app/?v=7.1.0' }, { stored: { [seenKey]: '7.1.0' } }]) {
    const p = page(options);
    await settle();
    assert.equal(p.nodes.updateNotice.hidden, false);
    assert.match(p.nodes.updateNoticeMessage.textContent, /7\.3\.0/);
    assert.equal(p.nodes.btnApplyUpdate.textContent, 'ادامه');
    p.nodes.btnApplyUpdate.emit('click');
    assert.equal(p.nodes.updateNotice.hidden, true);
    assert.equal(p.reloads, 0);
    assert.equal(p.flushes, 0);
    assert.equal(p.localStorage.getItem(seenKey), '7.3.0');
    assert.equal(p.serviceWorker.registrationArgs[1].updateViaCache, 'none');
    const reopened = page({ url: p.location.href, localStorage: p.localStorage });
    await settle();
    assert.equal(reopened.nodes.updateNotice, undefined, 'acknowledging a stale query does not repeat after reload');
  }
});

test('acknowledging a stale query preserves unrelated query parameters and fragment', async () => {
  const p = page({ url: 'https://example.com/app/?v=7.1.0&customer=123#draft' });
  await settle();
  p.nodes.btnApplyUpdate.emit('click');
  const url = new URL(p.location.href);
  assert.equal(url.searchParams.get('v'), '7.3.0');
  assert.equal(url.searchParams.get('customer'), '123');
  assert.equal(url.hash, '#draft');
});

test('a waiting worker supplies its own target version and dismissal is per release', async () => {
  const local = storage();
  const p = page({ waiting: worker('v7.3.1'), localStorage: local });
  await settle();
  assert.match(p.nodes.updateNoticeMessage.textContent, /7\.3\.1/);
  p.nodes.updateNoticeSuppress.checked = true;
  p.nodes.updateNoticeSuppress.emit('change');
  p.nodes.btnDismissUpdate.emit('click');
  assert.equal(local.getItem(dismissedKey), '7.3.1');
  p.window.emit('focus');
  await settle();
  assert.equal(p.nodes.updateNotice.hidden, true);
  const reopen = page({ waiting: worker('v7.3.1'), localStorage: local });
  await settle();
  assert.equal(reopen.nodes.updateNotice, undefined);
  const nextRelease = page({ waiting: worker('v7.3.2'), localStorage: local });
  await settle();
  assert.equal(nextRelease.nodes.updateNotice.hidden, false);
  assert.match(nextRelease.nodes.updateNoticeMessage.textContent, /7\.3\.2/);
});

test('accepting an update saves pending edits before activation and reloads only once', async () => {
  const waiting = worker('v7.3.1');
  const p = page({ waiting });
  await settle();
  p.nodes.quickEntryText.value = 'اسدبهار ۹ مهر ۲ تن';
  p.nodes.btnApplyUpdate.emit('click');
  assert.equal(p.flushes, 1);
  assert.ok(waiting.messages.includes('SKIP_WAITING'));
  assert.equal(p.reloads, 0);
  p.serviceWorker.controller = waiting;
  p.serviceWorker.emit('controllerchange');
  p.serviceWorker.emit('controllerchange');
  assert.equal(p.reloads, 1);
  assert.equal(p.flushes, 2);
  assert.equal(p.sessionStorage.getItem('shilan-invoice-update-quick-draft'), p.nodes.quickEntryText.value);
  assert.equal(p.sessionStorage.getItem('shilan-invoice-update-applied-version'), '7.3.1');
});

test('a failed draft save prevents activation and reload, keeping the draft visible', async () => {
  const waiting = worker('v7.3.1');
  const p = page({ waiting, saveSucceeds: false });
  await settle();
  p.nodes.btnApplyUpdate.emit('click');
  assert.ok(!waiting.messages.includes('SKIP_WAITING'));
  assert.equal(p.reloads, 0);
  assert.equal(p.nodes.updateNotice.hidden, false);
  assert.equal(p.nodes.btnApplyUpdate.disabled, false);
  assert.match(p.nodes.updateNoticeMessage.textContent, /ذخیره فاکتور کامل نشد/);
});

test('activation in another tab never flushes or reloads this tab', async () => {
  const waiting = worker('v7.3.1');
  const p = page({ waiting });
  await settle();
  p.registration.waiting = null;
  p.serviceWorker.controller = waiting;
  p.serviceWorker.emit('controllerchange');
  await settle();
  assert.equal(p.flushes, 0);
  assert.equal(p.reloads, 0);
  assert.equal(p.nodes.updateNotice.hidden, false);
  p.nodes.btnApplyUpdate.emit('click');
  assert.equal(p.reloads, 1, 'the consenting sibling can use the already-active worker');
});

test('offline checks keep the app usable, and repeated focus checks are throttled', async () => {
  const offline = page({ offline: true });
  await settle();
  assert.equal(offline.registration.updates, 0);
  assert.equal(offline.reloads, 0);
  const online = page();
  await settle();
  online.window.emit('focus'); online.window.emit('focus');
  await settle();
  assert.equal(online.registration.updates, 1);
  assert.equal(online.nodes.updateNotice, undefined);
});

function serviceWorkerHarness(fetchImpl) {
  const events = {}, writes = [], precached = [];
  let skips = 0;
  const cached = new Response('offline-shell');
  const cache = { addAll: async requests => precached.push(...requests),
    put: async (key, response) => writes.push([key, await response.text()]),
    match: async () => cached.clone() };
  const context = {
    self: { registration: { scope: 'https://example.com/app/' }, location: { origin: 'https://example.com' },
      addEventListener: (type, handler) => { events[type] = handler; },
      skipWaiting: async () => { skips++; }, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: fetchImpl || (async () => new Response('network')), URL, Request, Response
  };
  vm.runInNewContext(swSource, context);
  return { events, writes, precached, get skips() { return skips; } };
}

test('installation fully precaches without forced activation, and messages report the release', async () => {
  const sw = serviceWorkerHarness();
  let done;
  sw.events.install({ waitUntil: promise => { done = promise; } });
  await done;
  assert.equal(sw.skips, 0);
  assert.ok(sw.precached.length > 10);
  assert.ok(sw.precached.every(request => request.cache === 'reload'));
  let reply;
  sw.events.message({ data: { type: 'GET_VERSION' }, ports: [{ postMessage: message => { reply = message; } }] });
  assert.deepEqual(JSON.parse(JSON.stringify(reply)), { type: 'VERSION', version: 'v7.3.0' });
  sw.events.message({ data: { type: 'SKIP_WAITING' }, waitUntil: promise => { done = promise; } });
  await done;
  assert.equal(sw.skips, 1);
});

test('legacy versioned scripts use the network; offline query navigation uses the cached shell', async () => {
  const sw = serviceWorkerHarness();
  let response;
  sw.events.fetch({ request: { method: 'GET', mode: 'cors', url: 'https://example.com/app/assets/js/pwa.js?v=7.1.0' },
    respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'network');
  assert.equal(sw.writes.length, 1);
  const offline = serviceWorkerHarness(async () => { throw new Error('offline'); });
  offline.events.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.com/app/?v=7.1.0#draft' },
    respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'offline-shell');
});

/**
 * Headless smoke test — executes page-script PAIRS in one vm context with a
 * minimal DOM stub, faithfully reproducing the shared global lexical scope of
 * classic browser <script> tags (this is how the products.js/API_BASE collision
 * was caught). Also drives the admin boot flow per scenario config.
 *
 * Usage:
 *   node scripts/uiSmokeTest.js js/app.js js/products.js
 *   node scripts/uiSmokeTest.js admin/js/admin-core.js admin/js/admin.js \
 *        --cfg=scripts/cfg-admin.js          (cfg exports {page, api:{frag:json}})
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
    className: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (this._handlers ||= {})[type] = fn; },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    appendChild() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
    dataset: {},
  };
}

const elements = {};
const handlers = {};

global.window = {
  NOVA_API_BASE: 'http://127.0.0.1:5000/api',
  location: { search: '', pathname: '/index.html', href: 'http://127.0.0.1:5500/index.html', assign() {} },
  addEventListener(type, fn) { handlers[type] = fn; },
};
global.document = {
  getElementById(id) { elements[id] ??= makeEl(id); return elements[id]; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { handlers['doc:' + type] = fn; },
  createElement(tag) { return makeEl('dyn-' + tag); },
  body: Object.assign(makeEl('body'), { dataset: {} }),
  head: makeEl('head'),
};
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
global.location = global.window.location;
global.confirm = () => false;
global.alert = () => {};
global.CSS = { escape: (s) => s };

/* --- scenario config (--cfg=<js module exporting {page, api:{fragment:json}}>) --- */
let pageName = 'index';
let expectBoot = false;
let loginFlow = null;
const apiRoutes = {};
const expectText = [];
if (process.env.DUMP_ELEMENTS) global.__DUMP = true;
const files = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--cfg=')) {
    const cfg = require(path.resolve(a.slice(6)));
    pageName = cfg.page || 'index';
    expectBoot = !!cfg.expectBoot;
    loginFlow = cfg.login || null;
    if (cfg.auth) {
      // pre-seed a logged-in session before page scripts run
      global.localStorage.setItem('novamart_auth_v1', JSON.stringify(cfg.auth));
    }
    for (const t of cfg.expect || []) expectText.push(t);
    Object.assign(apiRoutes, cfg.api || {});
  } else files.push(a);
}

/* minimal FormData + reload tracking for login-flow simulation */
global.__RELOADED = false;
global.location.reload = () => { global.__RELOADED = true; };
global.FormData = class FormData {
  constructor(target) { this.fields = (target && target.__fields) || []; }
  get(k) { const f = this.fields.find((x) => x.name === k); return f ? f.value : null; }
};
global.document.body.dataset.page = pageName;

global.fetch = async (url) => {
  const p = String(url).replace(/^https?:\/\/[^/]+/, '');
  for (const [frag, payload] of Object.entries(apiRoutes)) {
    if (p.includes(frag)) return { ok: true, status: 200, json: async () => payload };
  }
  return { ok: false, status: 401, json: async () => ({ success: false, message: 'Unauthorized' }) };
};

/* --- load scripts into one shared context (classic-script semantics) --- */
const ctx = vm.createContext({
  window: global.window,
  document: global.document,
  localStorage: global.localStorage,
  fetch: global.fetch,
  location: global.location,
  confirm: global.confirm,
  alert: global.alert,
  CSS: global.CSS,
  FormData: global.FormData,
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  URLSearchParams,
});
for (const f of files) {
  try {
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    console.log(`LOADED OK : ${f}`);
  } catch (err) {
    console.error(`LOAD FAIL : ${f} -> ${err.message}`);
    process.exitCode = 1;
  }
}

/* --- fire DOMContentLoaded like a browser would, then report what rendered --- */
(async () => {
  try {
    if (handlers['doc:DOMContentLoaded']) await handlers['doc:DOMContentLoaded']();
    if (handlers.DOMContentLoaded) await handlers.DOMContentLoaded();
    await new Promise((r) => setTimeout(r, 300));
    console.log('RUNTIME   : DOMContentLoaded completed without throwing');

    /* optional login-flow simulation: find submit handler, fire it with credentials */
    if (loginFlow) {
      const form = elements['a-login-form'];
      const handler = form && form._handlers && form._handlers.submit;
      if (!handler) {
        console.error('LOGIN FAIL: no submit handler bound to #a-login-form');
        process.exitCode = 1;
      } else {
        await handler({
          preventDefault() {},
          target: {
            __fields: [
              { name: 'email', value: loginFlow.email },
              { name: 'password', value: loginFlow.password },
            ],
            querySelector() { return { disabled: false }; },
          },
        });
        await new Promise((r) => setTimeout(r, 150));
        const stored = JSON.parse(localStorage.getItem('novamart_auth_v1') || 'null');
        if (stored && stored.token && stored.user && stored.user.role === 'admin') {
          console.log('LOGIN OK  : admin auth stored, role=admin');
        } else {
          console.error('LOGIN FAIL: auth not stored after submit ->', JSON.stringify(stored));
          process.exitCode = 1;
        }
        console.log(global.__RELOADED ? 'RELOAD    : location.reload() was invoked' : 'RELOAD    : NOT invoked');
      }
    }

    const root = elements['admin-root'];
    /* content assertions across every rendered element */
    if (expectText.length || global.__DUMP) {
      const entries = Object.entries(elements).filter(([, e]) => String(e.innerHTML).length > 3);
      if (global.__DUMP) {
        console.log('DUMP      :', entries.map(([k, e]) => `${k}=${String(e.innerHTML).length}`).join(', ') || '(nothing rendered)');
        const first = entries.find(([k]) => k === 'checkout-root') || entries.find(([k]) => k.startsWith('co')) || entries[1] || entries[0];
        if (first) console.log('DUMP FIRST:', first[0], 'â†’', String(first[1].innerHTML).slice(0, 160).replace(/\s+/g, ' '));
      }
    }
    if (expectText.length) {
      const all = Object.values(elements).map((e) => String(e.innerHTML)).join('\n');
      let ok = true;
      for (const t of expectText) {
        const found = all.includes(t);
        console.log((found ? 'EXPECT OK : ' : 'EXPECT FAIL: ') + '"' + t + '"');
        if (!found) ok = false;
      }
      if (!ok) process.exitCode = 1;
    }
    if (root) {
      const html = String(root.innerHTML);
      console.log('RENDERED  :', html.length, 'chars', root.dataset.booted === '1' ? '(booted)' : '(NOT booted)');
      if (expectBoot && root.dataset.booted !== '1') {
        console.error('  !! expected boot to complete — dispatcher never rendered');
        process.exitCode = 1;
      }
      console.log('RENDERED  :', html.length, 'chars');
      let matched = false;
      for (const probe of ['NovaMart Admin', 'Sign in', 'admin access',
        'Total Users', 'Total Revenue', 'card-value']) {
        if (html.includes(probe)) { console.log(`  contains "${probe}"`); matched = true; }
      }
      if (!matched && html.length) console.log('  first 150 chars:', html.slice(0, 150).replace(/\s+/g, ' '));
      if (html.trim() === '') { console.error('  !! admin-root is EMPTY — nothing rendered'); process.exitCode = 1; }
    }
  } catch (err) {
    console.error('RUNTIME FAIL:', err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : err);
    process.exitCode = 1;
  }
})();

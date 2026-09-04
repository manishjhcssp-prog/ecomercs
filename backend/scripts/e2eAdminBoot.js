/**
 * e2eAdminBoot.js — integration test: REAL login against the live API,
 * then execute admin-core.js + admin.js with the genuine token and REAL
 * network access, asserting the dashboard actually renders.
 * Usage: node scripts/e2eAdminBoot.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const API = 'http://127.0.0.1:5000';
const EMAIL = 'admin@novamart.dev';
const PASSWORD = 'Admin!2345';

function makeEl(id) {
  return {
    id, innerHTML: '', dataset: {}, style: {}, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(t, f) { (this._h ||= {})[t] = f; },
    querySelector() { return makeEl('q'); }, querySelectorAll() { return []; },
    appendChild() {}, setAttribute() {}, getAttribute() { return null; },
  };
}

(async () => {
  // 1) real login
  const lr = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const lj = await lr.json();
  if (!lr.ok || !lj.data?.token) { console.error('LOGIN FAIL:', lr.status, JSON.stringify(lj)); process.exit(1); }
  console.log('live login : OK role=' + lj.data.user.role);

  // 2) browser-like environment with REAL fetch and REAL stored auth
  const els = {}; const handlers = {};
  const storage = { _s: { novamart_auth_v1: JSON.stringify({ token: lj.data.token, user: lj.data.user }) } };
  const documentStub = {
    getElementById(id) { els[id] ??= makeEl(id); return els[id]; },
    // persistent per-selector elements so innerHTML written via querySelector is observable
    querySelector(sel) {
      const key = 'q' + String(sel).replace(/[^a-z0-9-]/gi, '');
      els[key] ??= makeEl(key);
      return els[key];
    },
    querySelectorAll() { return []; },
    createElement(t) { return makeEl('dyn' + t); },
    body: Object.assign(makeEl('body'), { dataset: { page: 'index' } }),
    head: makeEl('head'),
    addEventListener(t, f) { handlers['doc:' + t] = f; },
  };
  const ctx = vm.createContext({
    window: { location: { href: '', assign() {} }, addEventListener() {}, NOVA_API_BASE: `${API}/api` },
    document: documentStub,
    localStorage: {
      getItem: (k) => storage._s[k] ?? null,
      setItem: (k, v) => { storage._s[k] = String(v); },
      removeItem: (k) => { delete storage._s[k]; },
    },
    fetch: (url, opts) => fetch(url, opts), // REAL network
    CSS: { escape: (s) => s },
    location: { href: '', reload() {} },
    console, setTimeout, clearTimeout,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    URLSearchParams, FormData: class { get() { return null; } },
    confirm: () => false, alert() {},
  });

  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../frontend/admin/js/admin-core.js'), 'utf8'), ctx, { filename: 'core' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../frontend/admin/js/admin.js'), 'utf8'), ctx, { filename: 'page' });
  // trace which runner gets picked
  vm.runInContext("console.log('[trace] page=', JSON.stringify(document.body.dataset.page));", ctx);
  try {
    await handlers['doc:DOMContentLoaded']();
    console.log('[trace] DOMContentLoaded handler resolved');
  } catch (e) {
    console.log('[trace] HANDLER THREW:', e.message);
  }
  await new Promise((r) => setTimeout(r, 400));
  console.log('[trace] elements so far:', Object.keys(els).filter((k) => !k.startsWith('dyn')).join(', ') || '(none)');
  // give REAL network calls (meta + dashboard) time to complete.
  // NOTE: renderShell returns the #page-root SECTION — runners write there, not into admin-root!
  let html = '';
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    html = ['admin-root', 'page-root', 'qpage-root']
      .map((k) => (els[k] ? els[k].innerHTML : '')).join('|');
    if ((html.includes('Total Users') || html.includes('card-value')) && !html.includes('Loading')) break;
    if (html.includes('Could not load this page') || html.includes('Boot failed')) break;
  }

  // 3) assert dashboard content
  const booted = els['admin-root'] && els['admin-root'].dataset.booted === '1';
  const hasCards = html.includes('Total Users') || html.includes('card-value');
  const stillLogin = html.includes('a-login-form');
  console.log('booted     :', booted);
  console.log('login box? :', stillLogin);
  console.log('dashboard? :', hasCards);
  if (!stillLogin && booted && hasCards) { console.log('\nE2E RESULT : ✅ full loop works — dashboard rendered with live data'); }
  else {
    console.log('\nE2E RESULT : ❌ loop broken');
    console.log('root snippet:', html.slice(0, 300).replace(/\s+/g, ' '));
    process.exit(1);
  }
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });

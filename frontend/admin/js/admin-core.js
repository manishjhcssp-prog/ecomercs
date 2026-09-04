/* ==========================================================================
   NovaMart Admin — admin-core.js
   Shared shell for all /admin pages. REUSES the storefront authentication
   system end-to-end: same JWT, same localStorage key (novamart_auth_v1),
   same /api/auth/login endpoint. The inline panel below is only a second
   LOGIN SURFACE for convenience — there is no second auth mechanism.
   SECURITY NOTE: this client-side role check is UX only; every /api/admin
   route is enforced server-side by protect + requireAdmin.
   ========================================================================== */

'use strict';

const ADMIN = (() => {
  const AUTH_KEY = 'novamart_auth_v1'; // identical to storefront app.js
  const API_BASE = 'http://127.0.0.1:5000/api';
  let META = null;

  function readAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
  }
  function writeAuth(auth) { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); }
  function clearAuth() { localStorage.removeItem(AUTH_KEY); }

  async function api(path, { method = 'GET', body } = {}) {
    const auth = readAuth();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || (json && json.success === false)) {
      const err = new Error((json && json.message) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function formatINR(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  function toast(message, isError = false) {
    let el = document.getElementById('a-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'a-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'a-toast' + (isError ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
    requestAnimationFrame(() => el.classList.add('show'));
  }

  /* ---------- shell ---------- */
  const NAV = [
    ['index', 'Dashboard', 'index.html'],
    ['products', 'Products', 'products.html'],
    ['inventory', 'Inventory', 'inventory.html'],
    ['orders', 'Orders', 'orders.html'],
    ['reviews', 'Reviews', 'reviews.html'],
    ['users', 'Users', 'users.html'],
  ];

  function renderShell(page) {
    const root = document.getElementById('admin-root');
    root.dataset.booted = '1'; // tells the inline boot-check fallback we took over
    root.innerHTML = `
      <button class="a-burger" id="a-burger" aria-label="Menu">☰</button>
      <aside class="a-side" id="a-side">
        <div class="a-brand">NovaMart <span>Admin</span></div>
        <nav>
          ${NAV.map(([key, label, href]) => `
            <a href="${href}" class="${key === page ? 'active' : ''}">${label}</a>`).join('')}
        </nav>
        <button class="a-logout" id="a-logout" type="button">Logout</button>
        <div class="a-side-user">${esc((readAuth() || {}).user?.name || '')}</div>
      </aside>
      <main class="a-main" id="a-main">
        <header class="a-topbar"><h1>${NAV.find(([k]) => k === page)?.[1] || 'Admin'}</h1></header>
        <section id="page-root" class="a-page"></section>
      </main>`;

    document.getElementById('a-burger').addEventListener('click', () => {
      document.getElementById('a-side').classList.toggle('open');
    });
    document.getElementById('a-logout').addEventListener('click', () => {
      clearAuth();
      location.reload();
    });
    return document.getElementById('page-root');
  }

  /* ---------- gate: auth → role → load (directive §24) ---------- */
  function renderLogin(root, message) {
    root.innerHTML = `
      <div class="a-login">
        <h2>NovaMart Admin</h2>
        ${message ? `<p class="a-login-msg">${esc(message)}</p>` : ''}
        <form id="a-login-form">
          <label>Email<input type="email" name="email" required autocomplete="username"></label>
          <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
          <button type="submit" class="btn-primary">Sign in</button>
          <p id="a-login-status" style="font-size:13px;min-height:18px;margin:6px 0 0"></p>
          <p class="a-login-hint">Uses the store's normal login. Admin role required.</p>
        </form>
      </div>`;

    document.getElementById('a-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type="submit"]');
      const status = document.getElementById('a-login-status');
      const say = (t, bad) => { if (status) { status.textContent = t; status.style.color = bad ? '#b02a37' : '#555'; } if (btn) btn.disabled = false; };
      if (btn) btn.disabled = true;
      try {
        say('Contacting server…');
        const res = await Promise.race([
          fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Server did not respond within 8s.')), 8000)),
        ]);
        say('Checking response…');
        const json = await res.json();
        if (!res.ok || !json.data?.token) throw new Error(json.message || `Login failed (HTTP ${res.status}).`);
        if (json.data.user?.role !== 'admin') {
          throw new Error('This account does not have admin access.');
        }
        writeAuth({ token: json.data.token, user: json.data.user });
        say('Login OK — reloading…');
        location.reload();
      } catch (err) {
        say(`Sign-in failed: ${err.message}`, true);
        toast(err.message, true);
      }
    });
  }

  async function boot() {
    const page = document.body.dataset.page;
    const root = renderShell(page);
    const auth = readAuth();

    if (!auth || !auth.token) {
      renderLogin(root, 'Please sign in with an administrator account.');
      return null;
    }
    try {
      const me = await api('/auth/me'); // server re-validates the token AND account
      // API returns the user object directly in data (no .user nesting) — accept both shapes.
      const meUser = (me.data && (me.data.user || me.data)) || null;
      if (!meUser || meUser.role !== 'admin') {
        clearAuth();
        renderLogin(root, 'That account is not an administrator.');
        return null;
      }
    } catch (err) {
      clearAuth();
      renderLogin(root, err.status === 403 ? 'Account deactivated.' : 'Session expired — please sign in again.');
      return null;
    }

    META = (await api('/admin/meta')).data; // server config for selects/thresholds
    return root;
  }

  function meta() { return META; }

  return { boot, api, esc, formatINR, fmtDate, toast, meta };
})();

if (window.__BOOT_LOG) window.__BOOT_LOG.push('core-executed');

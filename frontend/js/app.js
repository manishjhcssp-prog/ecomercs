/* ==========================================================================
   NovaMart — app.js
   Shared shell logic loaded on every page:
   formatting, authentication state, SERVER-BACKED cart & wishlist,
   navigation, wishlist popover, account popover, toasts, form handling.
   Page logic lives in products.js (catalog/details) and cart.js (cart page).

   Phase 6 architecture: MongoDB is the source of truth for cart & wishlist.
   This file keeps lightweight IN-MEMORY mirrors of the last server response
   purely for instant badge/popover rendering. Guests are prompted to log in
   before any cart/wishlist action; the backend enforces it regardless.
   ========================================================================== */

'use strict';

const Store = {
  NAME: 'NovaMart',
  AUTH_KEY: 'novamart_auth_v1',
  FREE_DELIVERY_OVER: 999,
  DELIVERY_FEE: 49,
};

/* Relative-path helpers. Each <body> declares data-base=""
   (pages at frontend root) or data-base="../" (pages inside /pages). */
const BASE = document.body.getAttribute('data-base') || '';
function pageURL(file) { return `${BASE}pages/${file}`; }
function homeURL(hash = '') { return `${BASE}index.html${hash}`; }

/* Inline SVG icons reused by JS-rendered markup */
const ICON_HEART = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.8C6.9 17 3.5 13.7 3.5 10a4.6 4.6 0 0 1 4.6-4.6c1.6 0 3 .8 3.9 2.1a4.8 4.8 0 0 1 3.9-2.1A4.6 4.6 0 0 1 20.5 10c0 3.7-3.4 7-8.5 10.8Z"/></svg>';
const ICON_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>';
const ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

/* ---------- Utilities ---------- */
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

/* ---------- Backend API ----------
   Single base URL for all pages; override via window.NOVA_API_BASE. */
const API_BASE = window.NOVA_API_BASE || 'http://127.0.0.1:5000/api';
window.NOVA = { API_BASE }; // shared with products.js

/** Minimal JSON fetch wrapper. Throws Error(message) on non-success responses. */
async function api(path, { method = 'GET', body = null, auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const session = readJSON(Store.AUTH_KEY, null);
  if (auth && session && session.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data;
}

/* ---------- Authentication state ---------- */
/* Stored shape: {token, user:{id,name,email,role,…}} — UI convenience only;
   the backend always enforces real authorization. */
function getAuth() { return readJSON(Store.AUTH_KEY, null); }
function isLoggedIn() {
  const session = getAuth();
  return Boolean(session && session.token && session.user);
}
function saveAuth(authData) {
  writeJSON(Store.AUTH_KEY, authData);
  refreshAccountUI();
  refreshServerState().catch(() => { /* offline — badges stay empty */ });
}
function logout() {
  localStorage.removeItem(Store.AUTH_KEY);
  cartState = { items: [], itemCount: 0, subtotal: 0 };
  wishState = [];
  updateBadges();
  renderWishPopover();
  showToast('Logged out');
  refreshAccountUI();
}

/** Guests get a clear path to login; ?next= returns them afterwards. */
function promptLogin(message = 'Please log in to continue.') {
  showToast(message);
  const here = `${location.pathname.split('/').pop()}${location.search}`;
  setTimeout(() => {
    location.assign(`${pageURL('login.html')}?next=${encodeURIComponent(here)}`);
  }, 900);
}

/* ---------- Server-backed cart & wishlist state ----------
   Mirrors of the last server response. NEVER written back to the server
   wholesale — every mutation goes through a dedicated API call so the
   database stays authoritative (spec §21/§22). */
let cartState = { items: [], itemCount: 0, subtotal: 0 };
let wishState = []; // [{id,name,price,image,stock}]

/* Read-only accessor for page scripts (cart.js/checkout.js) — classic scripts
   share the global scope, so this top-level function is their window in. */
function getCartMirror() { return cartState; }

function applyCartData(data) {
  cartState = {
    items: Array.isArray(data.items) ? data.items : [],
    itemCount: Number(data.itemCount) || 0,
    subtotal: Number(data.subtotal) || 0,
  };
  updateBadges();
}

function applyWishlistData(data) {
  wishState = Array.isArray(data.products) ? data.products : [];
  updateBadges();
  renderWishPopover();
  /* Sync already-rendered hearts (cards/details painted before data arrived) */
  document.querySelectorAll('[data-wish-id]').forEach((btn) => {
    const active = isWishlisted(btn.dataset.wishId);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    const label = btn.querySelector('span');
    if (label) label.textContent = active ? 'Wishlisted' : 'Add to Wishlist';
  });
}

async function refreshCartFromServer() {
  const res = await api('/cart', { auth: true });
  applyCartData(res.data);
}

async function refreshWishlistFromServer() {
  const res = await api('/wishlist', { auth: true });
  applyWishlistData(res.data);
}

/** Fetch both mirrors after login/boot. Failures are non-fatal (offline/DB down). */
async function refreshServerState() {
  await Promise.all([
    refreshCartFromServer(),
    refreshWishlistFromServer(),
  ]);
}

function isWishlisted(id) {
  return wishState.some((p) => p.id === String(id));
}

/* ---------- Cart mutations (each returns the fresh server cart) ---------- */
async function addToCart(id, qty = 1, { silent = false } = {}) {
  if (!isLoggedIn()) { promptLogin('Please log in to add items to your cart.'); return false; }
  try {
    const res = await api('/cart/items', {
      method: 'POST', body: { productId: String(id), quantity: Number(qty) || 1 }, auth: true,
    });
    applyCartData(res.data);
    if (!silent) showToast('Added to cart', { actionLabel: 'View Cart', actionHref: storePage('cart.html') });
    document.dispatchEvent(new CustomEvent('nova:cart-changed'));
    return true;
  } catch (err) {
    showToast(err.message);
    return false;
  }
}

async function setCartQty(productId, quantity) {
  const res = await api(`/cart/items/${encodeURIComponent(productId)}`, {
    method: 'PUT', body: { quantity: Number(quantity) }, auth: true,
  });
  applyCartData(res.data);
  document.dispatchEvent(new CustomEvent('nova:cart-changed'));
  return cartState;
}

async function removeFromCart(productId) {
  const res = await api(`/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE', auth: true });
  applyCartData(res.data);
  document.dispatchEvent(new CustomEvent('nova:cart-changed'));
  return cartState;
}

async function clearServerCart() {
  const res = await api('/cart', { method: 'DELETE', auth: true });
  applyCartData(res.data);
  document.dispatchEvent(new CustomEvent('nova:cart-changed'));
  return cartState;
}

/* ---------- Wishlist mutations ---------- */
/** Toggles a product in the server wishlist. Returns true when added. */
async function toggleWishlist(id) {
  if (!isLoggedIn()) { promptLogin('Please log in to save wishlist items.'); return null; }
  try {
    if (!isWishlisted(id)) {
      const res = await api(`/wishlist/${encodeURIComponent(id)}`, { method: 'POST', auth: true });
      applyWishlistData(res.data);
      showToast(res.message || 'Saved to wishlist');
      return true;
    }
    const res = await api(`/wishlist/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
    applyWishlistData(res.data);
    showToast(res.message || 'Removed from wishlist');
    return false;
  } catch (err) {
    showToast(err.message);
    return null;
  }
}

/* ---------- UI: badges & wishlist popover ---------- */
function updateBadges() {
  const cartBadge = document.getElementById('cart-count');
  if (cartBadge) {
    const n = cartState.itemCount;
    cartBadge.textContent = n > 99 ? '99+' : String(n);
    cartBadge.hidden = n === 0;
  }
  const wishBadge = document.getElementById('wish-count');
  if (wishBadge) {
    const n = wishState.length;
    wishBadge.textContent = n > 99 ? '99+' : String(n);
    wishBadge.hidden = n === 0;
  }
  renderWishPopover();
}

function renderWishPopover() {
  const list = document.getElementById('wish-list');
  if (!list) return;

  if (!isLoggedIn()) {
    list.innerHTML = '<li class="wish-empty">Log in to build a wishlist that follows you everywhere.</li>';
    return;
  }
  if (!wishState.length) {
    list.innerHTML = '<li class="wish-empty">Your wishlist is empty. Tap the heart on any product to save it.</li>';
    return;
  }
  list.innerHTML = wishState.map((w) => `
    <li class="wish-item">
      <img src="${escapeHTML(w.image)}" alt="" width="44" height="44">
      <span class="wi-info">
        <a class="wi-name" href="${pageURL('product-details.html')}?id=${encodeURIComponent(w.id)}">${escapeHTML(w.name)}</a>
        <span class="text-muted">${formatINR(w.price)}</span>
        <button class="btn btn-outline btn-sm" type="button" data-add-id="${escapeHTML(w.id)}"
          ${w.stock <= 0 ? 'disabled' : ''} style="margin-top:4px">${w.stock <= 0 ? 'Out of stock' : 'Add to cart'}</button>
      </span>
      <button class="wi-remove" type="button" data-wish-remove="${escapeHTML(w.id)}"
        aria-label="Remove ${escapeHTML(w.name)} from wishlist">${ICON_TRASH}</button>
    </li>`).join('');
}

/* ---------- UI: toast ---------- */
let toastTimer;
function showToast(message, opts) {
  /* Backward compatible: showToast(msg) · showToast(msg, true) = error ·
     Phase 10: showToast(msg, {isError, actionLabel, actionHref}) adds an
     inline action link (e.g. "View Cart") instead of intrusive popups. */
  const o = (opts && typeof opts === 'object') ? opts : { isError: opts === true };
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.classList.toggle('error', Boolean(o.isError));
  toast.textContent = message;
  if (o.actionHref) {
    const a = document.createElement('a');
    a.href = o.actionHref;
    a.className = 'toast-action';
    a.textContent = o.actionLabel || 'View';
    toast.appendChild(document.createTextNode(' '));
    toast.appendChild(a);
  }
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.remove('error');
  }, 2600);
}

/** Path-aware link into /pages regardless of current depth (root vs pages/). */
function storePage(href) {
  return /\/pages\//.test(window.location.pathname) ? '../pages/' + href : 'pages/' + href;
}

/* ---------- UI: header search suggestions (Phase 10) ----------
   Debounced live suggestions under each .nav-search form; Enter still
   submits the normal full-search navigation. No external services. */
let suggestTimer = null;
let suggestAbort = null;

function closeSuggestions() {
  document.querySelectorAll('.nav-suggest').forEach((box) => box.remove());
}

async function runSuggestions(form, term) {
  const old = form.parentElement.querySelector('.nav-suggest');
  if (old) old.remove();
  if (!term || term.length < 2) return;
  try {
    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();
    const res = await fetch(`${window.NOVA.API_BASE}/products?search=${encodeURIComponent(term)}&limit=5&sort=rating`, { signal: suggestAbort.signal });
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return;

    const box = document.createElement('div');
    box.className = 'nav-suggest';
    if (!json.data.length) {
      box.innerHTML = '<div class="ns-empty">No matching products</div>';
    } else {
      box.innerHTML = json.data.map((p) => `
        <a class="ns-row" href="${storePage('product-details.html')}?id=${encodeURIComponent(p.id || p._id)}">
          <span class="ns-name">${escapeHTML(p.name)}</span>
          <span class="ns-price">${formatINR(p.price)}</span>
        </a>`).join('')
        + `<a class="ns-all" href="pages/products.html?q=${encodeURIComponent(term)}">See all results for “${escapeHTML(term)}”</a>`;
      box.querySelectorAll('a[href]').forEach((a) => {
        // keep deep links working from /pages too
        if (/\/pages\//.test(window.location.pathname)) {
          a.setAttribute('href', a.getAttribute('href').replace(/^pages\//, '../pages/'));
        }
      });
    }
    form.parentElement.appendChild(box);
  } catch {/* aborted or offline — suggestions are best-effort */ }
}

function wireSearchForms() {
  document.querySelectorAll('form.nav-search').forEach((form) => {
    const input = form.querySelector('input[type="search"]');
    if (!input || input.dataset.suggestBound) return;
    input.dataset.suggestBound = '1';
    input.addEventListener('input', () => {
      clearTimeout(suggestTimer);
      const term = input.value.trim();
      suggestTimer = setTimeout(() => runSuggestions(form, term), 250);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSuggestions(); });
    form.addEventListener('submit', () => closeSuggestions());
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-search') && !e.target.closest('.nav-suggest')) closeSuggestions();
  });
}

/* ---------- UI: star ratings ---------- */
function starsHTML(rating, count) {
  const percent = Math.round((rating / 5) * 100);
  const row = `
    <span class="stars" role="img" aria-label="Rated ${rating} out of 5">
      <span aria-hidden="true">★★★★★</span>
      <span class="stars-fill" style="width:${percent}%" aria-hidden="true">★★★★★</span>
    </span>
    <span class="rating-num">${rating}</span>`;
  return count == null ? row : `${row}<span class="rating-count">(${count})</span>`;
}

/* ---------- Navbar account state ----------
   When a session exists, the plain "login" icon becomes an account toggle
   with a popover (name/email/role + logout). Injected via JS so the HTML
   stays untouched. UI convenience only — the backend enforces everything. */
function accountButton() {
  return document.querySelector('.header-actions a[href$="login.html"], #account-btn');
}

function refreshAccountUI() {
  const btn = accountButton();
  if (!btn) return;
  const existingPop = document.getElementById('account-pop');

  if (isLoggedIn()) {
    const user = getAuth().user;
    btn.id = 'account-btn';
    btn.setAttribute('href', '#');
    btn.style.position = 'relative';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', String(existingPop ? !existingPop.hidden : false));
    btn.setAttribute('aria-label', `Account: ${user.name}`);
    btn.title = user.email;

    let pop = existingPop;
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'account-pop';
      pop.className = 'wish-pop'; // reuse existing popover styling
      pop.hidden = true;
      document.querySelector('.header-actions').appendChild(pop);
    }
    pop.innerHTML = `
      <h3>${escapeHTML(user.name)}</h3>
      <p class="wish-empty">${escapeHTML(user.email)} · ${escapeHTML(user.role)}</p>
      <a class="btn btn-outline btn-sm btn-block" href="${pageURL('orders.html')}" style="margin-top:8px">My Orders</a>
      <button class="btn btn-outline btn-sm btn-block" type="button" id="logout-btn" style="margin-top:8px">Log out</button>`;
  } else {
    if (btn.id === 'account-btn') {
      btn.removeAttribute('id');
      btn.setAttribute('href', pageURL('login.html'));
      btn.removeAttribute('aria-haspopup');
      btn.removeAttribute('aria-expanded');
      btn.removeAttribute('title');
    }
    if (existingPop) existingPop.remove();
  }
}

/* ---------- Global event delegation ---------- */
document.addEventListener('click', async (event) => {
  /* Add-to-cart buttons: product cards, details page, wishlist popover */
  const addBtn = event.target.closest('[data-add-id]');
  if (addBtn) {
    if (addBtn.disabled) return;
    addBtn.disabled = true;
    await addToCart(addBtn.dataset.addId, 1);
    addBtn.disabled = false;
    return;
  }

  /* Wishlist hearts on product cards / details page */
  const wishBtn = event.target.closest('[data-wish-id]');
  if (wishBtn) {
    const id = wishBtn.dataset.wishId;
    const wasActive = wishBtn.classList.contains('active');
    const added = await toggleWishlist(id);
    if (added === null) return; // guest redirect or error — no UI change
    document.querySelectorAll(`[data-wish-id="${CSS.escape(id)}"]`).forEach((btn) => {
      btn.classList.toggle('active', added);
      btn.setAttribute('aria-pressed', String(added));
    });
    /* Details-page heart also carries a text label */
    const label = wishBtn.querySelector('span');
    if (label) label.textContent = added ? 'Wishlisted' : 'Add to Wishlist';
    return;
  }

  /* Remove buttons inside the wishlist popover */
  const wishRemove = event.target.closest('[data-wish-remove]');
  if (wishRemove) {
    await toggleWishlist(wishRemove.dataset.wishRemove);
    return;
  }

  /* Account popover toggle (only active when logged in) */
  const acctToggle = event.target.closest('#account-btn');
  if (acctToggle) {
    event.preventDefault();
    const pop = document.getElementById('account-pop');
    if (pop) {
      const willOpen = pop.hidden;
      pop.hidden = !willOpen;
      acctToggle.setAttribute('aria-expanded', String(willOpen));
    }
    return;
  }

  /* Logout button inside the account popover */
  if (event.target.closest('#logout-btn')) { logout(); return; }

  /* Mobile menu toggle */
  const navToggle = event.target.closest('#nav-toggle');
  if (navToggle) {
    const panel = document.getElementById('mobile-nav');
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    navToggle.setAttribute('aria-expanded', String(willOpen));
    return;
  }

  /* Wishlist popover toggle — refresh from server when opening (logged in) */
  const popoverToggle = event.target.closest('#wish-btn');
  if (popoverToggle) {
    const popover = document.getElementById('wish-pop');
    const willOpen = popover.hidden;
    popover.hidden = !willOpen;
    popoverToggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen && isLoggedIn()) {
      refreshWishlistFromServer().catch(() => { /* keep cached view */ });
    }
    return;
  }

  /* Click outside closes any open popover */
  const popover = document.getElementById('wish-pop');
  if (popover && !popover.hidden && !event.target.closest('.wish-wrap')) {
    popover.hidden = true;
    document.getElementById('wish-btn')?.setAttribute('aria-expanded', 'false');
  }
  const acctPop = document.getElementById('account-pop');
  if (acctPop && !acctPop.hidden && !event.target.closest('#account-pop, #account-btn')) {
    acctPop.hidden = true;
    document.getElementById('account-btn')?.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const popover = document.getElementById('wish-pop');
  if (popover && !popover.hidden) {
    popover.hidden = true;
    document.getElementById('wish-btn')?.setAttribute('aria-expanded', 'false');
  }
  const acctPop = document.getElementById('account-pop');
  if (acctPop && !acctPop.hidden) {
    acctPop.hidden = true;
    document.getElementById('account-btn')?.setAttribute('aria-expanded', 'false');
  }
});

/* Password visibility toggles (login/register forms) */
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pw-toggle]');
  if (!button) return;
  const input = document.getElementById(button.getAttribute('aria-controls'));
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
});

/* Real authentication forms (login.html / register.html). */
async function handleAuthForm(form) {
  /* data-match: simple "confirm password" support (register) */
  form.querySelectorAll('[data-match]').forEach((input) => {
    const target = document.getElementById(input.dataset.match);
    input.setCustomValidity(
      target && input.value !== target.value ? 'Passwords do not match.' : ''
    );
  });
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const mode = form.dataset.authForm;
  const payload = mode === 'login'
    ? {
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value,
    }
    : {
      name: document.getElementById('reg-name').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
    };

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
      method: 'POST',
      body: payload,
    });
    saveAuth({ token: res.data.token, user: res.data.user });
    showToast(mode === 'login'
      ? `Welcome back, ${res.data.user.name}!`
      : `Account created — welcome, ${res.data.user.name}!`);

    /* Honor ?next= (set when guests were redirected here), else go home.
       Only bare page filenames (optionally with a query) are accepted. */
    const nextParam = new URLSearchParams(location.search).get('next');
    const safeNext = nextParam && /^[A-Za-z0-9._~-]+\.html(\?.*)?$/.test(nextParam)
      ? nextParam
      : '';
    setTimeout(() => {
      location.assign(safeNext ? `${BASE}pages/${safeNext}` : homeURL());
    }, 700);
  } catch (err) {
    showToast(err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* Demo + real form handling. */
document.addEventListener('submit', (event) => {
  const authForm = event.target.closest('[data-auth-form]');
  if (authForm) { event.preventDefault(); handleAuthForm(authForm); return; }

  const form = event.target.closest('[data-demo-submit]');
  if (!form) return;
  event.preventDefault();

  /* data-match: simple "confirm password" support */
  form.querySelectorAll('[data-match]').forEach((input) => {
    const target = document.getElementById(input.dataset.match);
    input.setCustomValidity(
      target && input.value !== target.value ? 'Passwords do not match.' : ''
    );
  });

  if (!form.checkValidity()) { form.reportValidity(); return; }
  showToast(form.dataset.demoMessage || 'Demo only — backend not connected yet.');
  form.reset();
});

/* ---------- Payments (Phase 8, Razorpay) ----------
   Full server-verified flow: backend creates the gateway order with the
   AUTHORITATIVE amount, browser opens Razorpay Checkout, then the backend
   verifies the signature before anything is marked paid. The browser's
   success callback alone never changes an order's status. */
let razorpayScriptPromise = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = () => { razorpayScriptPromise = null; reject(new Error('Could not load the payment gateway.')); };
      document.head.appendChild(s);
    });
  }
  return razorpayScriptPromise;
}

/**
 * Runs the complete online payment round-trip for one order.
 * Resolves {order} when the BACKEND verified the payment; rejects otherwise.
 */
async function payWithRazorpay(orderId) {
  const create = await api('/payments/create', { method: 'POST', auth: true, body: { orderId } });
  await loadRazorpayScript();

  const user = (getAuth() || {}).user || {};
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: create.data.keyId,
      order_id: create.data.razorpayOrderId,
      amount: create.data.amount,
      currency: create.data.currency,
      name: Store.NAME,
      description: `Order ${orderId}`,
      prefill: { name: user.name, email: user.email },
      theme: { color: '#111111' },
      modal: { ondismiss: () => reject(new Error('Payment cancelled — your order stays unpaid and can be retried.')) },
      handler: async (response) => {
        try {
          const verify = await api('/payments/verify', {
            method: 'POST',
            auth: true,
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });
          resolve({ order: verify.data });
        } catch (err) {
          reject(err); // verification failed server-side — order remains unpaid
        }
      },
    });
    rzp.on('payment.failed', () => reject(new Error('Payment failed at the gateway — no money was captured. You can retry.')));
    rzp.open();
  });
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  refreshAccountUI();
  wireSearchForms(); // header live suggestions (Phase 10)
  if (isLoggedIn()) {
    refreshServerState().catch((err) => console.warn('[nova] server state unavailable:', err.message));
  } else {
    updateBadges(); // renders empty badges + guest popover hint
  }

  /* ---------- AI Shopper Init ---------- */
  const aiCss = document.createElement('link');
  aiCss.rel = 'stylesheet';
  aiCss.href = `${BASE}css/chat.css`;
  document.head.appendChild(aiCss);

  const aiJs = document.createElement('script');
  aiJs.src = `${BASE}js/chat.js`;
  document.body.appendChild(aiJs);
});

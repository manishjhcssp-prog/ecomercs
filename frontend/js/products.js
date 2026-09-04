/* ==========================================================================
   NovaMart — products.js
   Product data + catalog rendering (Phase 4).

   Data source: backend product API (GET /api/products, GET /api/products/:id).
   If the API is unreachable or the database is not connected, the page
   transparently falls back to the built-in demo catalog so the storefront
   keeps working. A small notice marks demo mode in the UI.

   Cart page logic lives in cart.js.
   ========================================================================== */

'use strict';
(function () {

/* ---------- API client ---------- */
/* Base URL is centralized in app.js (window.NOVA.API_BASE); override via
   window.NOVA_API_BASE before scripts load if ever needed. */
const API_BASE = (window.NOVA && window.NOVA.API_BASE) || 'http://127.0.0.1:5000/api';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !body || body.success === false) {
    throw new Error((body && body.message) || `API request failed (${res.status})`);
  }
  return body;
}

function toQueryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) search.set(key, String(value));
  });
  return search.toString();
}

/* ---------- Demo catalog (fallback + seed mirror) ---------- */
const DEMO_PRODUCTS = [
  { id: 'p01', name: 'Wireless Noise-Canceling Headphones', category: 'Electronics', price: 1999, mrp: 2999, rating: 4.5, ratingCount: 1284, stock: true, brand: 'NovaAudio', desc: 'Over-ear Bluetooth headphones with active noise cancellation, deep bass and a lightweight fit for all-day listening.', features: ['Active noise cancellation', '30-hour battery with USB-C fast charge', 'Bluetooth 5.3 with multipoint pairing'] },
  { id: 'p02', name: 'Smart Fitness Watch', category: 'Electronics', price: 2499, mrp: 3499, rating: 4.3, ratingCount: 932, stock: true, brand: 'NovaFit', desc: 'Track steps, heart rate, sleep and workouts on a bright color display with up to 10 days of battery life.', features: ['Heart-rate & SpO2 tracking', 'IP68 water resistance', '10-day battery life'] },
  { id: 'p03', name: '4K Action Camera', category: 'Electronics', price: 5499, mrp: 6999, rating: 4.4, ratingCount: 415, stock: false, brand: 'NovaCam', desc: 'Rugged 4K action camera with image stabilization, waterproof body and a wide-angle lens for adventure footage.', features: ['4K60 video with EIS', 'Waterproof to 10 m without a case', '170° wide-angle lens'] },
  { id: 'p04', name: 'Classic Cotton T-Shirt', category: 'Fashion', price: 499, mrp: 999, rating: 4.2, ratingCount: 2210, stock: true, brand: 'UrbanNova', desc: 'Soft 100% combed cotton t-shirt with a regular fit and reinforced stitching — an everyday essential.', features: ['100% combed cotton', 'Pre-shrunk fabric', 'Available in S–XXL'] },
  { id: 'p05', name: 'Slim-Fit Denim Jeans', category: 'Fashion', price: 1299, mrp: 2199, rating: 4.1, ratingCount: 876, stock: true, brand: 'UrbanNova', desc: 'Stretchable slim-fit jeans with a clean look, comfortable all-day stretch and durable denim weave.', features: ['Stretchable denim', 'Slim tapered fit', 'Fade-resistant wash'] },
  { id: 'p06', name: 'Running Sneakers', category: 'Sports', price: 2299, mrp: 3299, rating: 4.6, ratingCount: 1540, stock: true, brand: 'SwiftStep', desc: 'Lightweight running sneakers with cushioned midsole support and a breathable knit upper.', features: ['Cushioned EVA midsole', 'Breathable knit upper', 'Non-slip rubber outsole'] },
  { id: 'p07', name: 'Vitamin C Glow Serum', category: 'Beauty', price: 649, mrp: 999, rating: 4.4, ratingCount: 3105, stock: true, brand: 'GlowLab', desc: 'Lightweight vitamin C serum that brightens skin tone and reduces dullness with regular use.', features: ['15% vitamin C', 'Dermatologically tested', 'Fragrance-free formula'] },
  { id: 'p08', name: 'Matte Lipstick Set', category: 'Beauty', price: 799, mrp: 1299, rating: 4.0, ratingCount: 654, stock: true, brand: 'GlowLab', desc: 'Set of five long-wear matte lipsticks in everyday nude and bold shades with a non-drying finish.', features: ['5 everyday shades', '8-hour transfer-resistant wear', 'Enriched with shea butter'] },
  { id: 'p09', name: 'Ceramic Dinner Set (16 pc)', category: 'Home', price: 2499, mrp: 3999, rating: 4.3, ratingCount: 289, stock: false, brand: 'HomeHearth', desc: 'Elegant 16-piece glazed ceramic dinner set that is microwave and dishwasher safe — service for four.', features: ['Service for 4', 'Microwave & dishwasher safe', 'Chip-resistant glaze'] },
  { id: 'p10', name: 'LED Table Lamp', category: 'Home', price: 899, mrp: 1499, rating: 4.2, ratingCount: 512, stock: true, brand: 'HomeHearth', desc: 'Minimal LED table lamp with three brightness levels and a warm, flicker-free light for desk or bedside.', features: ['3 brightness levels', 'Flicker-free warm light', 'USB-powered'] },
  { id: 'p11', name: 'Leather Crossbody Bag', category: 'Accessories', price: 1899, mrp: 2999, rating: 4.5, ratingCount: 743, stock: true, brand: 'NovaLeather', desc: 'Compact genuine-leather crossbody bag with an adjustable strap and secure zip compartments.', features: ['Genuine leather', 'Adjustable strap', 'Water-resistant lining'] },
  { id: 'p12', name: 'Minimalist Analog Watch', category: 'Accessories', price: 2999, mrp: 4499, rating: 4.6, ratingCount: 980, stock: true, brand: 'NovaTime', desc: 'Slim analog watch with a scratch-resistant glass face, stainless-steel case and quick-release strap.', features: ['Scratch-resistant glass', '5 ATM water resistance', '1-year battery life'] },
  { id: 'p13', name: 'Yoga Mat 6 mm', category: 'Sports', price: 749, mrp: 1299, rating: 4.4, ratingCount: 1120, stock: true, brand: 'SwiftStep', desc: 'High-density 6 mm yoga mat with an anti-slip textured surface and carrying strap.', features: ['Anti-slip texture', 'High-density cushioning', 'Carrying strap included'] },
  { id: 'p14', name: 'Stainless Steel Water Bottle', category: 'Sports', price: 599, mrp: 899, rating: 4.3, ratingCount: 2015, stock: true, brand: 'SwiftStep', desc: 'Double-walled vacuum-insulated steel bottle that keeps drinks cold for 24 h or hot for 12 h.', features: ['750 ml capacity', '24 h cold / 12 h hot insulation', 'Leak-proof cap'] },
];

const PAGE_SIZE = 8;

/* ---------- Helpers ---------- */
function discountPercent(product) {
  return product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;
}

function productById(id) {
  return DEMO_PRODUCTS.find((product) => product.id === id);
}

/** Generates a tidy SVG placeholder so the demo needs no binary assets. */
function placeholderImage(product, variant = 0) {
  const tints = ['#e0e7ff', '#fef3c7', '#fce7f3', '#d1fae5', '#e0f2fe', '#ede9fe'];
  const background = tints[variant % tints.length];
  const letter = escapeHTML(product.name.charAt(0).toUpperCase());
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>` +
    `<rect width='400' height='300' fill='${background}'/>` +
    `<circle cx='200' cy='122' r='62' fill='#ffffff' opacity='0.9'/>` +
    `<text x='200' y='146' text-anchor='middle' font-family='Arial, sans-serif' ` +
    `font-size='68' font-weight='700' fill='#334155'>${letter}</text>` +
    `<rect x='130' y='204' width='140' height='12' rx='6' fill='#ffffff' opacity='0.9'/>` +
    `<rect x='158' y='228' width='84' height='9' rx='4.5' fill='#ffffff' opacity='0.75'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Real image when the product has one; generated placeholder otherwise. */
function displayImage(product, variant = 0) {
  if (product.imageUrl && variant === 0) return product.imageUrl;
  return placeholderImage(product, variant);
}

function detailsURL(product) {
  return `${pageURL('product-details.html')}?id=${encodeURIComponent(product.id)}`;
}

/**
 * Maps an API product document onto the internal shape used by all renderers.
 * (API fields: _id, originalPrice, numReviews, images[], …)
 */
function normalizeProduct(raw) {
  return {
    id: raw._id || raw.id,
    name: raw.name,
    category: raw.category || '',
    brand: raw.brand || '',
    price: Number(raw.price) || 0,
    mrp: Number(raw.originalPrice) || Number(raw.price) || 0,
    rating: Number(raw.rating) || 0,
    ratingCount: Number(raw.numReviews) || 0,
    stock: (Number(raw.stock) || 0) > 0,
    desc: raw.description || '',
    features: [], // model has no feature list yet
    imageUrl: Array.isArray(raw.images) && raw.images.length ? raw.images[0] : null,
    isFeatured: Boolean(raw.isFeatured),
  };
}

/* ---------- Product card (shared by home & catalog) ---------- */
function productCardHTML(product) {
  const off = discountPercent(product);
  const wished = isWishlisted(product.id);
  const url = detailsURL(product);
  return `
    <article class="product-card">
      <a class="card-media" href="${url}" tabindex="-1" aria-hidden="true">
        <img src="${displayImage(product)}" alt="" loading="lazy">
        ${off ? `<span class="badge badge-discount">${off}% OFF</span>` : ''}
        ${product.stock ? '' : '<span class="badge badge-oos">Out of stock</span>'}
      </a>
      <button class="wish-btn${wished ? ' active' : ''}" type="button"
        data-wish-id="${escapeHTML(product.id)}" aria-pressed="${wished}"
        aria-label="${wished ? 'Remove' : 'Add'} ${escapeHTML(product.name)} ${wished ? 'from' : 'to'} wishlist">
        ${ICON_HEART}
      </button>
      <div class="card-body">
        <span class="card-cat">${escapeHTML(product.category)}</span>
        <h3 class="card-title"><a href="${url}">${escapeHTML(product.name)}</a></h3>
        <div class="rating-row">${starsHTML(product.rating, product.ratingCount)}</div>
        <p class="card-price">
          <span class="price">${formatINR(product.price)}</span>
          ${product.mrp > product.price ? `<span class="mrp">${formatINR(product.mrp)}</span>` : ''}
        </p>
        <button class="btn btn-primary btn-block" type="button"
          data-add-id="${escapeHTML(product.id)}" ${product.stock ? '' : 'disabled'}>
          Add to Cart
        </button>
      </div>
    </article>`;
}

/* ---------- Homepage: featured grid (API first, demo fallback) ---------- */
async function renderFeaturedGrid() {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;

  try {
    const res = await apiGet('/products?sort=featured&limit=8');
    const items = (res.data || []).map(normalizeProduct);
    if (items.length) {
      grid.innerHTML = items.map(productCardHTML).join('');
      return;
    }
  } catch (err) {
    console.warn('[NovaMart] Product API unavailable — showing demo products.', err.message);
  }
  grid.innerHTML = DEMO_PRODUCTS.slice(0, PAGE_SIZE).map(productCardHTML).join('');
}

/* ---------- Catalog page (products.html) ---------- */
function initCatalogPage() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') || '',
    cats: new Set(params.get('cat') ? params.get('cat').split(',') : []),
    minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : null,
    maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : null,
    minRating: params.get('rating') ? Number(params.get('rating')) : 0,
    inStockOnly: params.get('stock') === '1',
    onSale: params.get('sale') === '1', // any discount (server-side)
    sort: params.get('sort') || 'featured',
    visible: PAGE_SIZE,
    page: 1,                    // server page currently loaded up to
    raw: [],                    // accumulated normalized products (server mode)
    server: { total: 0, pages: 1 },
    fallback: false,            // true → serving demo data (API offline)
    token: 0,                   // race guard for out-of-order responses
  };

  const searchInput = document.getElementById('catalog-search');
  const form = document.getElementById('filter-form');
  const sortSelect = document.getElementById('sort-select');
  const countEl = document.getElementById('result-count');
  const loadMoreBtn = document.getElementById('load-more');
  const filtersToggle = document.getElementById('filters-toggle');
  const filtersPanel = document.getElementById('filters');
  const clearBtn = document.getElementById('clear-filters');

  /* Prefill controls from URL */
  if (searchInput && state.q) searchInput.value = state.q;
  if (form) {
    form.querySelectorAll('input[name="cat"]').forEach((box) => {
      box.checked = state.cats.has(box.value);
    });
    const minInput = document.getElementById('price-min');
    if (minInput && state.minPrice != null) minInput.value = String(state.minPrice);
    const maxInput = document.getElementById('price-max');
    if (maxInput && state.maxPrice != null) maxInput.value = String(state.maxPrice);
    const ratingRadio = form.querySelector(`input[name="rating"][value="${state.minRating}"]`);
    if (ratingRadio) ratingRadio.checked = true;
    const stockBox = document.getElementById('stock-only');
    if (stockBox) stockBox.checked = state.inStockOnly;
    const saleBox = document.getElementById('discount-only');
    if (saleBox) saleBox.checked = state.onSale;
  }
  if (sortSelect) sortSelect.value = state.sort;

  /** Phase 10: reflect filter/search/sort state into the address bar so
      refresh / back-forward / link-sharing all reproduce the same view. */
  function syncURL() {
    const p = new URLSearchParams();
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.cats.size) p.set('cat', [...state.cats].join(','));
    if (state.minPrice != null) p.set('minPrice', String(state.minPrice));
    if (state.maxPrice != null) p.set('maxPrice', String(state.maxPrice));
    if (state.minRating) p.set('rating', String(state.minRating));
    if (state.inStockOnly) p.set('stock', '1');
    if (state.onSale) p.set('sale', '1');
    if (state.sort !== 'featured') p.set('sort', state.sort);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function readFilters() {
    if (!form) return;
    state.cats = new Set(
      [...form.querySelectorAll('input[name="cat"]:checked')].map((box) => box.value)
    );
    const minInput = document.getElementById('price-min');
    state.minPrice = minInput && minInput.value !== '' ? Math.max(0, Number(minInput.value)) : null;
    const maxInput = document.getElementById('price-max');
    state.maxPrice = maxInput && maxInput.value !== '' ? Math.max(0, Number(maxInput.value)) : null;
    const ratingInput = form.querySelector('input[name="rating"]:checked');
    state.minRating = ratingInput ? Number(ratingInput.value) : 0;
    const stockBox = document.getElementById('stock-only');
    state.inStockOnly = Boolean(stockBox && stockBox.checked);
    const saleBox = document.getElementById('discount-only');
    state.onSale = Boolean(saleBox && saleBox.checked);
  }

  /** Demo-data-only residual filtering (the API now does this server-side). */
  function residualFilter(product) {
    if (state.minRating && product.rating < state.minRating) return false;
    if (state.inStockOnly && !product.stock) return false;
    if (state.onSale && discountPercent(product) <= 0) return false;
    return true;
  }

  const SORT_TO_API = {
    featured: 'featured',
    newest: 'newest',
    'price-asc': 'price_asc',
    'price-desc': 'price_desc',
    rating: 'rating',
    discount: 'featured', // sorted locally after fetch (no server field)
  };

  const SKELETON_CARDS = Array.from({ length: PAGE_SIZE }, () =>
    '<div class="product-card skeleton-card" aria-hidden="true"><div class="sk-img"></div><div class="sk-line w60"></div><div class="sk-line w90"></div><div class="sk-line w40"></div></div>'
  ).join('');

  async function loadServerPage(page, token) {
    if (page === 1) grid.innerHTML = `<div class="product-grid" id="catalog-grid-inner">${SKELETON_CARDS}</div>`;
    const query = toQueryString({
      search: state.q.trim(),
      category: [...state.cats].join(','),
      minPrice: state.minPrice ?? '',
      maxPrice: state.maxPrice ?? '',
      rating: state.minRating || '',
      inStock: state.inStockOnly ? '1' : '',
      sale: state.onSale ? '1' : '',
      sort: SORT_TO_API[state.sort] || 'featured',
      page,
      limit: PAGE_SIZE,
    });
    const res = await apiGet(`/products?${query}`);
    if (token !== state.token) return; // stale response — ignore

    let items = (res.data || []).map(normalizeProduct);
    if (state.sort === 'discount' && !state.fallback) {
      items = items.slice().sort((a, b) => discountPercent(b) - discountPercent(a));
    }
    state.raw = page === 1 ? items : state.raw.concat(items);
    state.server = res.pagination || { total: items.length, pages: 1 };
    state.fallback = false;
  }

  /** Full client-side filtering of DEMO_PRODUCTS (previous behaviour). */
  function loadFallback(token) {
    if (token !== state.token) return;
    const query = state.q.trim().toLowerCase();
    let list = DEMO_PRODUCTS.filter((product) => {
      if (query &&
          !product.name.toLowerCase().includes(query) &&
          !product.category.toLowerCase().includes(query)) return false;
      if (state.cats.size && !state.cats.has(product.category)) return false;
      if (state.minPrice != null && product.price < state.minPrice) return false;
      if (state.maxPrice != null && product.price > state.maxPrice) return false;
      if (state.minRating && product.rating < state.minRating) return false;
      if (state.inStockOnly && !product.stock) return false;
      if (state.onSale && discountPercent(product) <= 0) return false;
      return true;
    });

    switch (state.sort) {
      case 'price-asc': list = list.slice().sort((a, b) => a.price - b.price); break;
      case 'price-desc': list = list.slice().sort((a, b) => b.price - a.price); break;
      case 'rating': list = list.slice().sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount); break;
      case 'newest': break; // demo list is already newest-first
      case 'discount': list = list.slice().sort((a, b) => discountPercent(b) - discountPercent(a)); break;
    }

    state.raw = list;
    state.server = { total: list.length, pages: 1 };
    state.fallback = true;
    console.warn('[NovaMart] Using demo products (product API offline).');
  }

  function renderError(message) {
    grid.innerHTML = `
      <div class="empty-state error-state">
        <h3>Could not load products</h3>
        <p class="text-muted">${escapeHTML(message)}</p>
        <button class="btn btn-primary" type="button" id="retry-load">Try again</button>
      </div>`;
    document.getElementById('retry-load').addEventListener('click', () => apply(true));
  }

  function render() {
    const visibleList = state.fallback ? state.raw.filter(residualFilter) : state.raw;
    const shown = visibleList.slice(0, state.visible);

    if (!shown.length) {
      const filtered = state.q.trim() || state.cats.size || state.minPrice != null ||
        state.maxPrice != null || state.minRating || state.inStockOnly || state.onSale;
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No products found</h3>
          ${filtered ? `
            <p>Try:</p>
            <ul class="empty-tips">
              <li>A different search term</li>
              <li>Removing a price or rating filter</li>
              <li>Choosing another category</li>
            </ul>
            <button class="btn btn-primary" type="button" id="empty-clear">Clear all filters</button>`
          : '<p>Check back soon — new products are on the way.</p>'}
        </div>`;
    } else {
      grid.innerHTML = shown.map(productCardHTML).join('');
    }

    if (countEl) {
      countEl.textContent = state.fallback
        ? `Showing ${shown.length} of ${state.raw.length} products · demo data`
        : `Showing ${shown.length} of ${state.server.total} product${state.server.total === 1 ? '' : 's'}`;
    }
    if (loadMoreBtn) {
      loadMoreBtn.hidden = state.fallback
        ? state.visible >= state.raw.length
        : !(state.page < state.server.pages);
    }
  }

  async function apply(reset = true) {
    const token = ++state.token;
    if (reset) { state.page = 1; state.visible = PAGE_SIZE; }
    else {
      if (!state.fallback && state.page < state.server.pages) state.page += 1;
      state.visible += PAGE_SIZE;
    }
    syncURL();

    try {
      await loadServerPage(state.page, token);
    } catch (err) {
      if (token !== state.token) return;
      if (reset && state.page === 1) { renderError(err.message); return; }
      loadFallback(token);
    }
    if (token !== state.token) return;
    render();
  }

  function clearAll() {
    Object.assign(state, {
      q: '', cats: new Set(), minPrice: null, maxPrice: null, minRating: 0,
      inStockOnly: false, onSale: false, sort: 'featured',
    });
    if (form) form.reset();
    if (searchInput) searchInput.value = '';
    if (sortSelect) sortSelect.value = 'featured';
    apply(true);
  }

  /* Events */
  if (form) {
    form.addEventListener('change', () => { readFilters(); apply(true); });
    form.addEventListener('submit', (event) => event.preventDefault());
  }
  let debounce;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.q = searchInput.value; apply(true); }, 250);
    });
  }
  if (sortSelect) sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; apply(true); });
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => apply(false));
  if (filtersToggle && filtersPanel) {
    filtersToggle.addEventListener('click', () => {
      const open = filtersPanel.classList.toggle('open');
      filtersToggle.setAttribute('aria-expanded', String(open));
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  grid.addEventListener('click', (event) => {
    if (event.target.id === 'empty-clear') clearAll();
  });

  apply(true);
}

/* ---------- Product-details page (product-details.html) ---------- */
async function initDetailsPage() {
  const root = document.getElementById('pd-root');
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const requestedId = params.get('id');

  let product = null;
  if (requestedId) {
    try {
      const res = await apiGet(`/products/${encodeURIComponent(requestedId)}`);
      product = normalizeProduct(res.data);
    } catch (err) {
      console.warn('[NovaMart] Could not load product from API — falling back to demo data.', err.message);
    }
  }
  if (!product) product = productById(requestedId) || DEMO_PRODUCTS[0];

  document.title = `${product.name} · ${Store.NAME}`;
  const crumb = document.getElementById('crumb-here');
  if (crumb) crumb.textContent = product.name;

  const off = discountPercent(product);
  const wished = isWishlisted(product.id);

  root.innerHTML = `
    <div class="pd">
      <div class="pd-gallery">
        <img id="pd-img" class="pd-main-img" src="${displayImage(product)}" alt="${escapeHTML(product.name)}">
        <div class="pd-thumbs" role="group" aria-label="Product images">
          ${[0, 1, 2].map((variant) => `
            <button class="pd-thumb" type="button" data-variant="${variant}"
              aria-current="${variant === 0}" aria-label="View image ${variant + 1} of 3">
              <img src="${displayImage(product, variant)}" alt="">
            </button>`).join('')}
        </div>
      </div>

      <div class="pd-info">
        <span class="card-cat">${escapeHTML(product.category)}</span>
        <h1>${escapeHTML(product.name)}</h1>
        <div class="rating-row">
          ${starsHTML(product.rating, product.ratingCount)}
          <a class="rating-count-link" href="#pd-reviews">${product.ratingCount || 'No'} review${product.ratingCount === 1 ? '' : 's'}</a>
        </div>

        <p class="pd-price-row">
          <span class="pd-price">${formatINR(product.price)}</span>
          ${product.mrp > product.price
            ? `<span class="pd-mrp">${formatINR(product.mrp)}</span>
               <span class="pd-off">${off}% off</span>`
            : ''}
        </p>
        <p class="pd-stock ${product.stock ? 'in-stock' : 'out-stock'}">
          ${product.stock ? 'In stock' : 'Out of stock'}
        </p>

        <p class="pd-desc">${escapeHTML(product.desc)}</p>
        ${product.features.length ? `
          <ul class="pd-features">
            ${product.features.map((feature) => `<li>${ICON_CHECK}<span>${escapeHTML(feature)}</span></li>`).join('')}
          </ul>` : ''}

        <div class="pd-actions">
          <div class="qty" aria-label="Quantity">
            <button type="button" id="qty-minus" aria-label="Decrease quantity">−</button>
            <output id="qty-out" aria-live="polite">1</output>
            <button type="button" id="qty-plus" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn-primary" type="button" id="pd-add" ${product.stock ? '' : 'disabled'}>Add to Cart</button>
          <button class="btn btn-outline" type="button" id="pd-buy" ${product.stock ? '' : 'disabled'}>Buy Now</button>
          <button class="pd-wish${wished ? ' active' : ''}" type="button" id="pd-wish"
            data-wish-id="${escapeHTML(product.id)}" aria-pressed="${wished}">
            ${ICON_HEART}<span>${wished ? 'Wishlisted' : 'Add to Wishlist'}</span>
          </button>
        </div>

        <div class="pd-meta">
          ${product.brand ? `<div><span class="k">Brand</span><span class="v">${escapeHTML(product.brand)}</span></div>` : ''}
          <div><span class="k">Category</span><span class="v">${escapeHTML(product.category)}</span></div>
          <div><span class="k">Warranty</span><span class="v">1-year manufacturer warranty</span></div>
          <div><span class="k">Returns</span><span class="v">7-day easy returns</span></div>
          <div><span class="k">Delivery</span><span class="v">Free delivery on orders over ${formatINR(Store.FREE_DELIVERY_OVER)}</span></div>
        </div>
      </div>
    </div>

    <section id="pd-reviews" class="pd-section" aria-label="Reviews">
      <p class="text-muted">Loading reviews…</p>
    </section>

    <section id="pd-related" class="pd-section" aria-label="Related products" hidden>
      <h2 class="section-title">You may also like</h2>
      <div class="product-grid" id="pd-related-grid"></div>
    </section>`;

  /* Gallery thumbs swap the main image */
  const mainImg = document.getElementById('pd-img');
  const thumbs = [...root.querySelectorAll('.pd-thumb')];
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      mainImg.src = displayImage(product, Number(thumb.dataset.variant));
      thumbs.forEach((b) => b.setAttribute('aria-current', String(b === thumb)));
    });
  });

  /* Quantity stepper (1–5) */
  let qty = 1;
  const qtyOut = document.getElementById('qty-out');
  document.getElementById('qty-minus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1); qtyOut.textContent = qty;
  });
  document.getElementById('qty-plus').addEventListener('click', () => {
    qty = Math.min(5, qty + 1); qtyOut.textContent = qty;
  });

  /* Actions — server-backed: addToCart POSTs and returns true on success */
  document.getElementById('pd-add').addEventListener('click', () => addToCart(product.id, qty));
  document.getElementById('pd-buy').addEventListener('click', async () => {
    const ok = await addToCart(product.id, qty, { silent: true });
    if (ok) location.assign(pageURL('cart.html'));
  });

  /* Phase 10 sections */
  loadReviewsSection(product);
  loadRelatedSection(product);
}

/* ---------- Phase 10: reviews, rating distribution & related products ---------- */

function starPickerHTML(selected) {
  return [5, 4, 3, 2, 1].map((v) => `
    <label class="star-opt" title="${v} star${v > 1 ? 's' : ''}">
      <input type="radio" name="rv-rating" value="${v}" ${selected === v ? 'checked' : ''} />
      <span aria-hidden="true">★</span><span class="sr-only">${v}</span>
    </label>`).join('');
}

function reviewCardHTML(rv, { mine = false } = {}) {
  const who = rv.user && rv.user.name ? rv.user.name : 'Customer';
  const when = new Date(rv.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `
    <article class="review-card${mine ? ' mine' : ''}">
      <header class="rc-head">
        <strong class="rc-who">${escapeHTML(who)}${mine ? ' <span class="chip chip-you">You</span>' : ''}</strong>
        ${rv.verifiedPurchase ? '<span class="chip chip-verified">✓ Verified Purchase</span>' : ''}
        ${mine && rv.isApproved === false ? '<span class="chip chip-pending">Pending approval</span>' : ''}
      </header>
      <div class="rc-stars">${starsHTML(rv.rating)}</div>
      ${rv.title ? `<p class="rc-title">${escapeHTML(rv.title)}</p>` : ''}
      <p class="rc-body">${escapeHTML(rv.comment)}</p>
      <footer class="rc-date">${when}${mine ? `
        <button class="btn-link" type="button" data-rv-edit="${rv.id || rv._id}">Edit</button>
        <button class="btn-link danger" type="button" data-rv-del="${rv.id || rv._id}">Delete</button>` : ''}
      </footer>
    </article>`;
}

function distributionHTML(distribution, total) {
  if (!total) return '';
  return `<div class="dist">
    ${distribution.map((d) => {
      const pct = Math.round((d.count / total) * 100);
      return `<div class="dist-row">
        <span class="dist-label">${d.rating} ★</span>
        <span class="dist-bar"><span style="width:${pct}%"></span></span>
        <span class="dist-pct">${pct}%</span>
      </div>`;
    }).join('')}
  </div>`;
}

async function loadReviewsSection(product) {
  const section = document.getElementById('pd-reviews');
  if (!section) return;
  const pid = product.id;
  const authed = isLoggedIn();

  async function refresh() {
    try {
      const res = await api(`/products/${encodeURIComponent(pid)}/reviews?limit=10`, { auth: authed });
      render(res.data);
    } catch (err) {
      section.innerHTML = `
        <h2 class="section-title">Ratings &amp; reviews</h2>
        <div class="empty-state error-state">
          <p class="text-muted">Could not load reviews — ${escapeHTML(err.message)}</p>
          <button class="btn btn-outline btn-sm" type="button" id="rv-retry">Retry</button>
        </div>`;
      document.getElementById('rv-retry').addEventListener('click', () => {
        section.innerHTML = '<p class="text-muted">Loading reviews…</p>';
        refresh();
      });
    }
  }

  function render(data) {
    const { reviews = [], pagination = {}, distribution = [], summary = {}, myReview = null } = data;
    const count = summary.count ?? product.ratingCount ?? 0;
    const avg = summary.average != null ? summary.average : (product.rating || 0);

    const listHTML = reviews.length
      ? reviews.map((rv) => reviewCardHTML(rv)).join('')
      : '<p class="text-muted">No approved reviews yet. Be the first to share your experience.</p>';

    section.innerHTML = `
      <h2 class="section-title">Ratings &amp; reviews</h2>
      <div class="reviews-summary">
        <div class="rs-score">
          <span class="rs-avg">${avg > 0 ? avg.toFixed(1) : '–'}</span>
          ${starsHTML(avg)}
          <span class="rs-count">${count} rating${count === 1 ? '' : 's'} · ${pagination.total || count} review${(pagination.total || count) === 1 ? '' : 's'}</span>
        </div>
        ${distributionHTML(distribution, distribution.reduce((s, d) => s + d.count, 0))}
      </div>

      <div id="my-review-area"></div>

      <div class="review-list">${listHTML}</div>
      ${pagination.page < pagination.pages
        ? `<button class="btn btn-outline btn-sm" type="button" id="rv-more">Load more reviews</button>`
        : ''}`;

    /* load-more */
    const moreBtn = document.getElementById('rv-more');
    if (moreBtn) {
      let nextPage = pagination.page + 1;
      moreBtn.addEventListener('click', async () => {
        moreBtn.disabled = true;
        try {
          const extra = await api(`/products/${encodeURIComponent(pid)}/reviews?page=${nextPage}&limit=10`, { auth: authed });
          moreBtn.insertAdjacentHTML('beforebegin',
            extra.data.data.reviews.map((rv) => reviewCardHTML(rv)).join(''));
          nextPage += 1;
          if (!(extra.data.pagination.page < extra.data.pagination.pages)) moreBtn.remove();
          else moreBtn.disabled = false;
        } catch (err) {
          showToast(err.message, true);
          moreBtn.disabled = false;
        }
      });
    }

    renderMyReviewArea(myReview);
  }

  function renderMyReviewArea(myReview) {
    const area = document.getElementById('my-review-area');
    if (!area) return;

    if (!authed) {
      area.innerHTML = `
        <div class="review-form-wrap guest">
          <p>Have you used this product?</p>
          <a class="btn btn-outline btn-sm" href="${pageURL('login.html')}?next=${encodeURIComponent('product-details.html?id=' + pid)}">Log in to write a review</a>
        </div>`;
      return;
    }

    if (!myReview) { area.innerHTML = reviewFormHTML(); wireForm(area); return; }

    /* Existing review → show it with Edit/Delete; form appears in edit mode. */
    area.innerHTML = `
      <h3 class="sub-title">Your review</h3>
      ${reviewCardHTML({ ...myReview, user: { name: 'You' } }, { mine: true })}
      <div id="edit-slot"></div>`;
  }

  function reviewFormHTML(existing) {
    return `
      <div class="review-form-wrap">
        <h3 class="sub-title">${existing ? 'Edit your review' : 'Write a review'}</h3>
        <form id="rv-form">
          <div class="rv-stars" role="radiogroup" aria-label="Your rating">${starPickerHTML(existing ? existing.rating : 0)}
            <span id="rv-rating-label" class="text-muted">${existing ? existing.rating + ' / 5' : 'Select a rating'}</span>
          </div>
          <input class="input" type="text" id="rv-title" maxlength="100"
            placeholder="Title (optional)" value="${existing && existing.title ? escapeHTML(existing.title) : ''}" />
          <textarea class="input" id="rv-comment" rows="4" maxlength="1000" required
            placeholder="What did you like or dislike? (min 3 characters)">${existing ? escapeHTML(existing.comment) : ''}</textarea>
          <p class="form-msg text-muted" id="rv-msg">Reviews are checked by our team before they appear publicly.</p>
          <button class="btn btn-primary btn-sm" type="submit" id="rv-submit">${existing ? 'Update review' : 'Submit review'}</button>
          ${existing ? '<button class="btn btn-ghost btn-sm" type="button" id="rv-cancel-edit">Cancel</button>' : ''}
        </form>
      </div>`;
  }

  function wireForm(scope, existing) {
    const form = scope.querySelector('#rv-form');
    if (!form) return;
    const msg = form.querySelector('#rv-msg');
    const submitBtn = form.querySelector('#rv-submit');
    const cancelBtn = form.querySelector('#rv-cancel-edit');

    scope.querySelectorAll('.star-opt input').forEach((radio) => {
      radio.addEventListener('change', () => {
        const val = Number(radio.value);
        scope.querySelectorAll('.star-opt').forEach((label) => {
          label.classList.toggle('lit', Number(label.querySelector('input').value) <= val);
        });
        const label = form.querySelector('#rv-rating-label');
        if (label) label.textContent = `${radio.value} / 5`;
      });
      // initial paint (edit mode)
      radio.dispatchEvent(new Event('change'));
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => refresh());

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const ratingInput = form.querySelector('input[name="rv-rating"]:checked');
      const comment = form.querySelector('#rv-comment').value.trim();
      const title = form.querySelector('#rv-title').value.trim();

      if (!ratingInput) { showToast('Please select a star rating.', true); return; }
      if (comment.length < 3) { showToast('Please write at least a few words.', true); return; }

      submitBtn.disabled = true;
      const prevLabel = submitBtn.textContent;
      submitBtn.textContent = existing ? 'Updating…' : 'Submitting…';
      try {
        let res;
        if (existing) {
          res = await api(`/reviews/${existing.id || existing._id}`, {
            method: 'PUT', auth: true,
            body: { rating: Number(ratingInput.value), title, comment },
          });
          showToast('Review updated — pending re-approval.');
        } else {
          res = await api(`/products/${encodeURIComponent(pid)}/reviews`, {
            method: 'POST', auth: true,
            body: { rating: Number(ratingInput.value), title, comment },
          });
          showToast('Review submitted — thank you!');
        }
        if (res.meta && res.meta.summary) updateHeaderSummary(res.meta.summary);
        await refresh();
      } catch (err) {
        if (msg) { msg.textContent = err.message; msg.style.color = '#b02a37'; }
        showToast(err.message, true);
        submitBtn.disabled = false;
        submitBtn.textContent = prevLabel;
      }
    });
  }

  /** Keep the top rating row in sync after submit/edit/delete. */
  function updateHeaderSummary(summary) {
    const row = document.querySelector('#pd-root .rating-row');
    if (row) {
      row.innerHTML = `${starsHTML(summary.rating || 0, summary.numReviews || 0)}
        <a class="rating-count-link" href="#pd-reviews">${summary.numReviews || 'No'} review${summary.numReviews === 1 ? '' : 's'}</a>`;
    }
  }

  /* Delegated actions for Edit/Delete on my review */
  section.addEventListener('click', async (event) => {
    const editBtn = event.target.closest('[data-rv-edit]');
    const delBtn = event.target.closest('[data-rv-del]');
    if (editBtn) {
      try {
        const res = await api(`/products/${encodeURIComponent(pid)}/reviews?limit=1`, { auth: true });
        const mine = res.data.data.myReview;
        const slot = document.getElementById('edit-slot');
        if (slot && mine) {
          slot.innerHTML = reviewFormHTML(mine);
          wireForm(slot, mine);
          slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (err) { showToast(err.message, true); }
    }
    if (delBtn) {
      if (!confirm('Delete your review?')) return;
      delBtn.disabled = true;
      try {
        const res = await api(`/reviews/${delBtn.dataset.rvDel}`, { method: 'DELETE', auth: true });
        showToast('Review deleted.');
        if (res.meta && res.meta.summary) updateHeaderSummary(res.meta.summary);
        await refresh();
      } catch (err) {
        showToast(err.message, true);
        delBtn.disabled = false;
      }
    }
  });

  await refresh();
}

async function loadRelatedSection(product) {
  const wrap = document.getElementById('pd-related');
  const gridEl = document.getElementById('pd-related-grid');
  if (!wrap || !gridEl) return;
  try {
    const res = await apiGet(`/products/${encodeURIComponent(product.id)}/related`);
    const items = (res.data || []).map(normalizeProduct);
    if (!items.length) return; // keep hidden
    gridEl.innerHTML = items.map(productCardHTML).join('');
    wrap.hidden = false;
  } catch {/* related is best-effort */}
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderFeaturedGrid();
  initCatalogPage();
  initDetailsPage();
});
})();

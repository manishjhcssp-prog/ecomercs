/**
 * e2eSearchRelated.js — Phase 10 catalog verification.
 * §31 search/filter/sort/pagination/combined + §32 related products rules.
 * Usage: node scripts/e2eSearchRelated.js
 */
'use strict';
const API = 'http://127.0.0.1:5000';
let passed = 0; let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 140) : ''); }
};
const q = async (path) => {
  const r = await fetch(API + path);
  return { status: r.status, data: await r.json() };
};

(async () => {
  console.log('— search behaviors —');
  let r = await q('/api/products?search=cotton');
  check('partial "cotton" finds Classic Cotton T-Shirt', r.data.data.some((p) => /cotton/i.test(p.name)), r.data.data.length);
  const cottonCount = r.data.data.length;

  r = await q('/api/products?search=COTTON');
  check('case-insensitive COTTON same count', r.data.data.length === cottonCount);

  r = await q('/api/products?search=zzzq_nothing_matches_zzzq');
  check('no-results → empty array, still 200', r.status === 200 && r.data.data.length === 0);
  check('no-results pagination.total = 0', r.data.pagination.total === 0);

  r = await q('/api/products?search=' + encodeURIComponent('100% cotton (new)! $pecial ^chars~'));
  check('special characters safe → no crash', r.status === 200 && Array.isArray(r.data.data));

  const long = 'a'.repeat(300);
  r = await q('/api/products?search=' + long);
  check('300-char search handled (capped, no error)', r.status === 200);

  r = await q('/api/products?search=   ');
  check('whitespace-only search ignored', r.status === 200 && r.data.data.length > 0);

  console.log('— category / price / availability —');
  r = await q('/api/products?category=electronics');
  check('category case-insensitive', r.data.data.every((p) => /^electronics$/i.test(p.category)) && r.data.data.length > 0);
  const catCount = r.data.pagination.total;

  r = await q('/api/products?search=fashion');
  check('search covers category field too', r.data.data.some((p) => /^fashion$/i.test(p.category)));

  r = await q('/api/products?minPrice=500&maxPrice=1500');
  check('price band respected', r.data.data.every((p) => p.price >= 500 && p.price <= 1500));

  r = await q('/api/products?inStock=1');
  check('inStock=1 → all stock>0', r.data.data.every((p) => p.stock > 0));

  r = await q('/api/products?rating=0');
  check('rating=0 rejected → 400', r.status === 400);
  r = await q('/api/products?rating=abc');
  check('rating=abc rejected → 400', r.status === 400);
  r = await q('/api/products?minPrice=-5');
  check('negative minPrice rejected → 400', r.status === 400);

  console.log('— sorting —');
  r = await q('/api/products?sort=price_asc&limit=50');
  const prices = r.data.data.map((p) => p.price);
  check('price_asc monotonic', prices.every((v, i) => i === 0 || v >= prices[i - 1]));
  r = await q('/api/products?sort=newest&limit=3');
  const dates = r.data.data.map((p) => new Date(p.createdAt).getTime());
  check('newest first by createdAt', dates.every((v, i) => i === 0 || v <= dates[i - 1]));

  console.log('— combined query —');
  r = await q('/api/products?search=a&category=fashion&maxPrice=5000&sort=price_asc&page=1&limit=5');
  check('combined works (fashion ≤5000 asc)', r.status === 200 &&
    r.data.data.every((p) => /^fashion$/i.test(p.category) && p.price <= 5000));
  check('pagination echoes page/limit', r.data.pagination.page === 1 && r.data.pagination.limit === 5);
  if (r.data.data.length >= 2) {
    const pp = r.data.data.map((p) => p.price);
    check('sort applied within filtered set', pp.every((v, i) => i === 0 || v >= pp[i - 1]));
  } else check('combined set has ≥2 rows for sort assertion', false);

  console.log('— related products (§32) —');
  const all = (await q('/api/products?limit=50')).data.data;
  const target = all.find((p) => p.stock > 0);
  r = await q(`/api/products/${target.id || target._id}/related`);
  const rel = r.data.data;
  check('related returns 200 with data array', r.status === 200 && Array.isArray(rel));
  check('excludes the product itself', rel.every((p) => (p.id || p._id) !== (target.id || target._id)));
  check('all related are active & share category or brand',
    rel.every((p) => p.isActive && (p.category === target.category ||
      (p.brand && target.brand && p.brand.toLowerCase() === String(target.brand).toLowerCase()))));
  check('respects limit ≤ 8', rel.length <= 8, rel.length);
  // inactive exclusion: soft-delete a sibling then confirm it never appears
  const adminLogin = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@novamart.dev', password: 'Admin!2345' }) });
  const admTok = (await adminLogin.json()).data.token;
  if (rel.length) {
    const victim = rel[0];
    const vid = victim.id || victim._id;
    await fetch(`${API}/api/admin/products/${vid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admTok}` } });
    const after = await q(`/api/products/${target.id || target._id}/related`);
    check('deactivated product vanishes from related', !after.data.data.some((p) => (p.id || p._id) === vid));
    // restore
    await fetch(`${API}/api/admin/products/${vid}`, { method: 'PUT', headers: { Authorization: `Bearer ${admTok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) });
    const restored = await q('/api/products/' + vid);
    check('restore via PUT isActive:true works', restored.status === 200 && restored.data.data.isActive === true);
  }
  r = await q('/api/products/000000000000000000000000/related');
  check('related for missing product → 404', r.status === 404);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });

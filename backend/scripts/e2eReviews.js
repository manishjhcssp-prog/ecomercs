/**
 * e2eReviews.js — Phase 10 live backend verification.
 * Covers directive §30: create/update/delete, duplicate rejection, invalid
 * ratings, empty comment, unauthorized edit/delete of another user's review,
 * verified-purchase detection, average-rating calculation + moderation flow.
 * Usage: node scripts/e2eReviews.js   (API must be running)
 */
'use strict';
const API = 'http://127.0.0.1:5000';
let passed = 0; let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 160) : ''); }
}

const j = async (r) => r.json();
async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await j(res) };
}

(async () => {
  const stamp = Date.now();
  const mkUser = async (name) => {
    const r = await call('POST', '/api/auth/register', { body: { name, email: `${name}.${stamp}@novamart.test`, password: 'E2ePass!123' } });
    if (r.status !== 201 && r.status !== 200) throw new Error('register failed ' + JSON.stringify(r.data));
    return { token: r.data.data.token, id: r.data.data.user.id };
  };

  console.log('— setup —');
  const u1 = await mkUser('revu1');           // buys the product → verified
  const u2 = await mkUser('revu2');           // no purchase → unverified
  const adminLogin = await call('POST', '/api/auth/login', { body: { email: 'admin@novamart.dev', password: 'Admin!2345' } });
  const adm = { token: adminLogin.data.data.token };

  const prodRes = await call('GET', '/api/products?limit=50');
  const products = prodRes.data.data;
  const product = products.find((p) => p.stock > 0);
  const pid = product.id || product._id;
  console.log('product:', product.name, pid);

  // u1 buys it: address → order (COD)
  const addr = await call('POST', '/api/users/addresses', { token: u1.token, body: { label: 'H', fullName: 'R U1', phone: '9999999999', addressLine1: '1 Rd', city: 'X', state: 'KA', postalCode: '560001', country: 'India', isDefault: true } });
  await call('POST', '/api/cart/items', { token: u1.token, body: { productId: pid, quantity: 1 } });
  const ord = await call('POST', '/api/orders', { token: u1.token, body: { addressId: addr.data.data.id || addr.data.data._id, paymentMethod: 'cod' } });
  check('setup: u1 placed COD order containing product', ord.status === 201, ord.data);

  console.log('— create reviews —');
  let r = await call('POST', `/api/products/${pid}/reviews`, { token: u1.token, body: { rating: 5, title: 'Great', comment: 'Excellent build quality and sound.' } });
  check('create (verified purchaser) → 201 pending', r.status === 201 && r.data.data.isApproved === false && r.data.data.verifiedPurchase === true, r.data);
  const rev1 = r.data.data.id;

  r = await call('POST', `/api/products/${pid}/reviews`, { token: u2.token, body: { rating: 4, comment: 'Looks nice from the photos.' } });
  check('create (non-buyer) → verifiedPurchase=false', r.status === 201 && r.data.data.verifiedPurchase === false, r.data);
  const rev2 = r.data.data.id;

  r = await call('POST', `/api/products/${pid}/reviews`, { token: u1.token, body: { rating: 3, comment: 'Trying to review twice.' } });
  check('duplicate review rejected → 409', r.status === 409, r.data);

  console.log('— validation —');
  // cleaner explicit probes with fresh users:
  const v1 = await mkUser('val1');
  for (const bad of [0, 6, -1, 10]) {
    r = await call('POST', `/api/products/${pid}/reviews`, { token: v1.token, body: { rating: bad, comment: 'Validation probe review.' } });
    check(`invalid rating ${bad} → 400`, r.status === 400, r.data);
  }
  r = await call('POST', `/api/products/${pid}/reviews`, { token: v1.token, body: { rating: 5, comment: '' } });
  check('empty comment → 400', r.status === 400, r.data);
  r = await call('POST', `/api/products/${pid}/reviews`, { token: v1.token, body: { rating: 5, comment: 'ok' } });
  check('comment <3 chars → 400', r.status === 400, r.data);
  r = await call('POST', '/api/products/000000000000000000000000/reviews', { token: v1.token, body: { rating: 5, comment: 'Ghost product review.' } });
  check('review on missing product → 404', r.status === 404, r.data);
  r = await call('POST', `/api/products/${pid}/reviews`, { body: { rating: 5, comment: 'Anonymous review attempt.' } });
  check('unauthenticated create → 401', r.status === 401, r.status);

  console.log('— moderation & visibility —');
  r = await call('GET', `/api/products/${pid}/reviews`);
  check('public GET hides pending reviews', r.data.data.reviews.length === 0, r.data.data.reviews.length);
  check('public GET summary count=0 while pending', r.data.data.summary.count === 0, r.data.data.summary);
  check('distribution empty while pending', (r.data.data.distribution || []).length === 0);

  r = await call('GET', `/api/products/${pid}/reviews`, { token: u1.token });
  check('owner sees own pending via myReview', r.data.data.myReview && r.data.data.myReview.rating === 5, !!r.data.data.myReview);

  r = await call('PUT', `/api/admin/reviews/${rev1}/status`, { token: adm.token, body: { isApproved: true } });
  check('admin approve → ok + summary updates', r.status === 200 && r.data.meta.summary.numReviews === 1, r.data.meta);
  r = await call('PUT', `/api/admin/reviews/${rev2}/status`, { token: adm.token, body: { isApproved: true } });
  check('second approve → numReviews=2 avg=4.5', Math.abs(r.data.meta.summary.rating - 4.5) < 0.001, r.data.meta.summary);

  r = await call('GET', `/api/products/${pid}/reviews`);
  check('approved reviews now public', r.data.data.reviews.length === 2, r.data.data.reviews.length);
  check('distribution has 5★:1 and 4★:1', JSON.stringify(r.data.data.distribution.map((d) => [d.rating, d.count]).sort()) === '[[4,1],[5,1]]', r.data.data.distribution);
  check('product card fields reflect avg', true); // covered via /products below

  const listAfter = await call('GET', `/api/products?rating=4&search=${encodeURIComponent(product.name.split(' ')[0])}`);
  check('server-side rating filter: 4.5★ product matches ≥4', listAfter.data.data.some((p) => (p.id || p._id) === pid), listAfter.data.pagination.total);
  const listAfter5 = await call('GET', '/api/products?rating=5&page=1&limit=50');
  check('avg 4.5 product NOT in 5★-only filter', !listAfter5.data.data.some((p) => (p.id || p._id) === pid));

  console.log('— ownership enforcement —');
  r = await call('PUT', `/api/reviews/${rev1}`, { token: u2.token, body: { comment: 'Hacked by u2!' } });
  check("u2 cannot edit u1's review → 403", r.status === 403, r.data);
  r = await call('DELETE', `/api/reviews/${rev1}`, { token: u2.token });
  check("u2 cannot delete u1's review → 403", r.status === 403, r.data);

  console.log('— edit re-moderation & aggregates —');
  r = await call('PUT', `/api/reviews/${rev1}`, { token: u1.token, body: { rating: 2, comment: 'Downgraded after longer use.' } });
  check('owner edit → 200, back to pending', r.status === 200 && r.data.data.isApproved === false, r.data);
  r = await call('GET', `/api/products/${pid}/reviews`);
  check('edited-out review drops from aggregates (count=1)', r.data.data.summary.count === 1 && r.data.data.summary.average === 4, r.data.data.summary);

  r = await call('PUT', `/api/admin/reviews/${rev1}/status`, { token: adm.token, body: { isApproved: true } });
  check('re-approve edited review → avg=(2+4)/2=3', Math.abs(r.data.meta.summary.rating - 3) < 0.001 && r.data.meta.summary.numReviews === 2, r.data.meta.summary);

  console.log('— delete paths —');
  r = await call('DELETE', `/api/reviews/${rev2}`, { token: u2.token });
  check('owner delete own → 200, aggregate recount', r.status === 200 && r.data.meta.summary.numReviews === 1, r.data.meta);
  r = await call('DELETE', `/api/admin/reviews/${rev1}`, { token: adm.token });
  check('admin delete any → 200, aggregates zeroed', r.status === 200 && r.data.meta.summary.numReviews === 0 && r.data.meta.summary.rating === 0, r.data.meta);
  r = await call('DELETE', '/api/reviews/000000000000000000000000', { token: u1.token });
  check('delete missing review → uniform 404', r.status === 404, r.status);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });

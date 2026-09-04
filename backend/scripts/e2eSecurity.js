/**
 * e2eSecurity.js — Phase 11 live verification.
 * Auth gates, admin gates, IDOR/ownership, mass-assignment, price/stock
 * integrity, payment faking, headers, rate limiting. READ-ONLY where possible;
 * mutations use throwaway entities created by this script.
 * Usage: node scripts/e2eSecurity.js
 */
'use strict';
const API = 'http://127.0.0.1:5000';
let passed = 0; let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 130) : ''); }
};
async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json(), headers: res.headers };
}

(async () => {
  const stamp = Date.now();
  console.log('— accounts —');
  const reg = async (name) => {
    const r = await call('POST', '/api/auth/register', { body: { name, email: `${name}.${stamp}@novamart.test`, password: 'E2ePass!123' } });
    if (r.status !== 201) throw new Error('register failed');
    return r.data.data.token;
  };
  const userA = await reg('seca');   // attacker perspective
  const userB = await reg('secb');   // victim perspective
  const adminLogin = await call('POST', '/api/auth/login', { body: { email: 'admin@novamart.dev', password: 'Admin!2345' } });
  const admin = adminLogin.data.data.token;

  console.log('— authentication gates —');
  for (const [m, p] of [['GET', '/api/cart'], ['GET', '/api/orders'], ['POST', '/api/orders'], ['PUT', '/api/users/profile'], ['DELETE', '/api/wishlist']]) {
    const r = await call(m, p);
    check(`${m} ${p} without token → 401`, r.status === 401, r.status);
  }
  let r = await call('GET', '/api/auth/me', { token: 'not.a.jwt' });
  check('garbage token → 401', r.status === 401);
  r = await call('GET', '/api/auth/me', { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMCJ9.sig' });
  check('forged token (bad signature) → 401', r.status === 401);

  console.log('— admin gates (normal user must fail everywhere) —');
  const adminEndpoints = [
    ['GET', '/api/admin/dashboard'], ['GET', '/api/admin/products'],
    ['GET', '/api/admin/users'], ['GET', '/api/admin/orders'],
    ['GET', '/api/admin/inventory'], ['GET', '/api/admin/reviews'],
    ['POST', '/api/admin/products'], ['PUT', '/api/admin/users/000000000000000000000000'],
    ['PUT', '/api/admin/orders/000000000000000000000000/status'],
    ['PUT', '/api/admin/reviews/000000000000000000000000/status'],
  ];
  for (const [m, p] of adminEndpoints) {
    const noTok = await call(m, p, { body: m === 'POST' ? {} : undefined });
    const asUser = await call(m, p, { token: userA, body: m === 'POST' || m === 'PUT' ? {} : undefined });
    check(`no-token ${m} ${p} → 401`, noTok.status === 401, noTok.status);
    check(`user-token ${m} ${p} → 403`, asUser.status === 403, asUser.status);
  }
  r = await call('GET', '/api/admin/dashboard', { token: admin });
  check('admin token works on dashboard', r.status === 200);

  console.log('— IDOR / object ownership —');
  // B creates an order; A must not see/cancel it.
  const addr = await call('POST', '/api/users/addresses', { token: userB, body: { label: 'Home', fullName: 'Sec Bee', phone: '9876543210', addressLine1: '1 Test Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India', isDefault: true } });
  if (!addr.data || !addr.data.data) throw new Error('address create failed: ' + JSON.stringify(addr).slice(0, 300));
  const prods = (await call('GET', '/api/products?inStock=1&limit=1')).data.data;
  await call('POST', '/api/cart/items', { token: userB, body: { productId: prods[0].id || prods[0]._id, quantity: 1 } });
  const ord = await call('POST', '/api/orders', { token: userB, body: { addressId: addr.data.data.id || addr.data.data._id, paymentMethod: 'cod' } });
  const orderId = ord.data.data.order ? ord.data.data.order.id : ord.data.data.id;
  check('B placed order', ord.status === 201, ord.status);

  r = await call('GET', `/api/orders/${orderId}`, { token: userA });
  check("A cannot view B's order → uniform 404", r.status === 404, r.status);
  r = await call('POST', `/api/orders/${orderId}/cancel`, { token: userA });
  check("A cannot cancel B's order → 404", r.status === 404, r.status);
  r = await call('POST', '/api/payments/create', { token: userA, body: { orderId } });
  check("A cannot start payment for B's order → 404", r.status === 404, r.status);
  r = await call('POST', '/api/payments/verify', { token: userA, body: { razorpayOrderId: 'order_fake', razorpayPaymentId: 'pay_fake', signature: 'deadbeef' } });
  check('fake payment verify rejected (not 200-paid)', r.status !== 200, r.status);

  console.log('— price / stock / payload integrity —');
  const before = (await call('GET', `/api/products?limit=50`)).data.data.find((p) => (p.id || p._id) === (prods[0].id || prods[0]._id));
  const cheatCart = await call('POST', '/api/cart/items', { token: userA, body: { productId: prods[0].id || prods[0]._id, quantity: 0 } });
  check('quantity 0 rejected in cart', cheatCart.status === 400, cheatCart.status);
  const cheatCart2 = await call('POST', '/api/cart/items', { token: userA, body: { productId: prods[0].id || prods[0]._id, quantity: -3 } });
  check('negative quantity rejected', cheatCart2.status === 400, cheatCart2.status);
  const addrA = await call('POST', '/api/users/addresses', { token: userA, body: { label: 'Home', fullName: 'Sec Ay', phone: '9876543211', addressLine1: '2 Test Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560002', country: 'India' } });
  await call('POST', '/api/cart/items', { token: userA, body: { productId: prods[0].id || prods[0]._id, quantity: 2 } });
  const fakeOrder = await call('POST', '/api/orders', { token: userA, body: { addressId: addrA.data.data.id, paymentMethod: 'cod', total: 1, subtotal: 0, price: 1 } });
  check('client-sent totals ignored by order create', fakeOrder.status === 201 && fakeOrder.data.data.total > 1, fakeOrder.data.data.total);
  // cleanup A's order so stock/data stay tidy
  await call('POST', `/api/orders/${fakeOrder.data.data.order ? fakeOrder.data.data.order.id : fakeOrder.data.data.id}/cancel`, { token: userA });

  console.log('— mass assignment —');
  const profileHack = await call('PUT', '/api/users/profile', { token: userA, body: { role: 'admin', isActive: true, email: 'hax@x.io' } });
  check('profile PUT with role/email → 400 (whitelist)', profileHack.status === 400, profileHack.status);
  const me = await call('GET', '/api/auth/me', { token: userA });
  check('role unchanged after hack attempt', me.data.data.role === 'user', me.data.data.role);

  const prodHack = await call('POST', '/api/admin/products', { token: userA, body: { name: 'Hax', description: 'nope', price: 1, category: 'Home', rating: 5, numReviews: 9999 } });
  check('normal user cannot create product → 403', prodHack.status === 403, prodHack.status);
  const prodAdminOk = await call('POST', '/api/admin/products', { token: admin, body: { name: `Audit T${stamp}`, description: 'Temporary audit product', price: 42, category: 'Home', rating: 5, numReviews: 9999 } });
  const created = prodAdminOk.data.data;
  check('admin create strips system fields (rating=0, numReviews=0)',
    created.rating === 0 && created.numReviews === 0, { rating: created.rating, numReviews: created.numReviews });
  const upd = await call('PUT', `/api/admin/products/${created.id || created._id}`, { token: admin, body: { rating: 5, numReviews: 9999, price: 43 } });
  check('update cannot set rating/numReviews either', upd.data.data.rating === 0 && upd.data.data.numReviews === 0, upd.data.data);
  // soft-delete the temp product to keep catalog clean
  await call('DELETE', `/api/admin/products/${created.id || created._id}`, { token: admin });

  console.log('— webhook cannot be faked —');
  const fakeHook = await fetch(API + '/api/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_fake', id: 'pay_fake' } } } }),
  });
  check('unsigned webhook rejected', fakeHook.status === 400 || fakeHook.status === 401, fakeHook.status);

  console.log('— security headers & limits —');
  const healthRes = await fetch(API + '/api/health');
  const h = healthRes.headers;
  check('X-Content-Type-Options: nosniff', (h.get('x-content-type-options') || '').toLowerCase() === 'nosniff');
  check('X-Frame-Options set (DENY/SAMEORIGIN)', !!h.get('x-frame-options'));
  check('Strict-Transport-Security present', !!h.get('strict-transport-security'));
  check('x-powered-by hidden', !healthRes.headers.get('x-powered-by'));
  const bigBody = await fetch(API + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(150 * 1024) }) });
  check('oversized JSON body rejected (413)', bigBody.status === 413, bigBody.status);

  console.log('— CORS —');
  const evil = await fetch(API + '/api/health', { headers: { Origin: 'https://evil.example' } });
  check('unknown origin gets NO allow-origin header', !evil.headers.get('access-control-allow-origin'));
  const good = await fetch(API + '/api/health', { headers: { Origin: 'http://127.0.0.1:5500' } });
  check('allowlisted origin echoed', good.headers.get('access-control-allow-origin') === 'http://127.0.0.1:5500');

  console.log('— error hygiene —');
  const badJson = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  const bj = await badJson.json();
  check('malformed JSON → clean 400 message', badJson.status === 400 && bj.message === 'Invalid JSON payload.', bj.message);
  const cast = await call('GET', '/api/products/notanobjectid');
  check('invalid ObjectId → clean 400 (not stack)', cast.status === 400 && typeof cast.data.message === 'string' && !cast.data.message.includes('at '), cast.data);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });

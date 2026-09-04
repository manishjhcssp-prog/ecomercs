/**
 * e2eCustomerOrder.js — full live-loop proof:
 * register user → login → add product to cart → create address → place COD order
 * → GET /api/orders must list it. Exercises exactly what the storefront does.
 * Usage: node scripts/e2eCustomerOrder.js
 */
'use strict';
const API = 'http://127.0.0.1:5000';

(async () => {
  const email = `e2e.${Date.now()}@novamart.test`;
  const password = 'E2ePass!123';

  // 1) register
  let r = await fetch(`${API}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Shopper', email, password }),
  });
  let j = await r.json();
  if (!r.ok) { console.error('register fail:', r.status, JSON.stringify(j)); process.exit(1); }
  const tok = j.data.token;
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  console.log('register   : OK', email);

  // 2) pick an in-stock product
  r = await fetch(`${API}/api/products?page=1&limit=5`);
  j = await r.json();
  const p = (j.data.products || j.data || []).find((x) => x.stock > 0 && x.isActive !== false);
  if (!p) { console.error('no purchasable product found'); process.exit(1); }
  console.log('product    :', p.name, '₹' + p.price, 'stock', p.stock);

  // 3) add to cart
  r = await fetch(`${API}/api/cart/items`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ productId: p.id || p._id, quantity: 1 }),
  });
  j = await r.json();
  if (!r.ok) { console.error('add-to-cart fail:', r.status, JSON.stringify(j)); process.exit(1); }
  console.log('cart       : itemCount =', j.data.itemCount);

  // 4) create address
  r = await fetch(`${API}/api/users/addresses`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      label: 'Home', fullName: 'E2E Shopper', phone: '9999999999',
      addressLine1: '1 Test St', city: 'Bengaluru', state: 'KA', postalCode: '560001', country: 'India', isDefault: true,
    }),
  });
  j = await r.json();
  if (!r.ok) { console.error('address fail:', r.status, JSON.stringify(j)); process.exit(1); }
  const addrId = (j.data.id || j.data._id);
  console.log('address    : OK', addrId);

  // 5) place COD order
  r = await fetch(`${API}/api/orders`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ addressId: addrId, paymentMethod: 'cod' }),
  });
  j = await r.json();
  if (!r.ok) { console.error('order fail:', r.status, JSON.stringify(j)); process.exit(1); }
  const orderNumber = j.data.order ? j.data.order.orderNumber : j.data.orderNumber;
  console.log('order      : PLACED', orderNumber);

  // 6) THE CHECK — My Orders endpoint for THIS exact user
  r = await fetch(`${API}/api/orders?page=1&limit=10`, { headers: { Authorization: `Bearer ${tok}` } });
  j = await r.json();
  const orders = (j.data && j.data.orders) || [];
  console.log('my-orders  : count =', orders.length, '| shape keys:', Object.keys(j.data || {}));
  const found = orders.some((o) => o.orderNumber === orderNumber);
  console.log(found
    ? '\nE2E RESULT : ✅ backend lists the new order for its owner — My Orders works'
    : '\nE2E RESULT : ❌ owner cannot see own order — backend filtering bug');
  process.exitCode = found ? 0 : 1;
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });

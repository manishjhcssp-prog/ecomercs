/* ==========================================================================
   NovaMart — checkout.js
   Checkout page (checkout.html) — Phase 7.

   Sections: Delivery Address (server address book + add/edit form),
   Order Items (from the SERVER cart), Price Summary (display only — the
   backend recalculates authoritatively), Payment Method (COD for now),
   Place Order → POST /api/orders → confirmation state.

   Guests are redirected to login (?next=checkout.html).
   ========================================================================== */

'use strict';

(function () {
  let root;
  let addresses = [];
  let selectedAddressId = null;
  let editingId = null; // address currently being edited (form mode)
  let busy = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    root = document.getElementById('checkout-root');
    if (!root) return;

    if (!isLoggedIn()) {
      promptLogin('Please log in to check out.');
      root.innerHTML = `
        <div class="empty-state">
          <h2>Login required</h2>
          <p class="text-muted">Redirecting you to sign in…</p>
        </div>`;
      return;
    }

    renderShell();
    loadAll();
  }

  /* ---------- shell ---------- */
  function renderShell() {
    root.innerHTML = `
      <div class="checkout-layout">
        <div>
          <section class="co-section" id="addr-section">
            <h2>1 · Delivery Address</h2>
            <div class="addr-list" id="addr-list"></div>
            <button class="btn btn-outline btn-sm" type="button" id="addr-toggle">+ Add new address</button>
            <div id="addr-form-wrap"></div>
          </section>
          <section class="co-section">
            <h2>2 · Order Items</h2>
            <div id="co-items"><p class="text-muted">Loading your cart…</p></div>
          </section>
          <section class="co-section">
            <h2>3 · Payment Method</h2>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <input type="radio" name="pay" value="cod" checked />
              <span>Cash on Delivery</span>
            </label>
            <label style="display:flex;gap:8px;align-items:center">
              <input type="radio" name="pay" value="razorpay" />
              <span>Pay online — UPI / Cards / NetBanking <span class="text-muted">(secure Razorpay checkout)</span></span>
            </label>
          </section>
        </div>
        <aside>
          <section class="co-section cart-summary" id="co-summary"></section>
        </aside>
      </div>`;

    document.getElementById('addr-toggle').addEventListener('click', () => {
      if (editingId === 'new') { closeForm(); return; }
      editingId = 'new';
      renderAddressForm(null);
    });
  }

  async function loadAll() {
    try {
      const [addrRes] = await Promise.all([
        api('/users/addresses', { auth: true }),
        refreshCartFromServer(), // fills order items + mirrors
      ]);
      addresses = addrRes.data;
      const preferred = addresses.find((a) => a.isDefault) || addresses[0];
      selectedAddressId = preferred ? preferred.id : null;

      renderAddresses();
      renderItems();
      renderSummary();
    } catch (err) {
      showToast(err.message);
    }
  }

  /* ---------- addresses ---------- */
  function renderAddresses() {
    const list = document.getElementById('addr-list');
    if (!addresses.length) {
      list.innerHTML = '<p class="text-muted">No saved addresses yet — add one below.</p>';
      return;
    }
    list.innerHTML = addresses.map((a) => `
      <label class="addr-card${a.id === selectedAddressId ? ' selected' : ''}">
        <input type="radio" name="ship-addr" value="${escapeHTML(a.id)}" ${a.id === selectedAddressId ? 'checked' : ''} />
        <span class="addr-body">
          <span class="addr-name">${escapeHTML(a.fullName)}${a.isDefault ? ' · <strong>Default</strong>' : ''}</span><br/>
          ${escapeHTML(a.phone)}<br/>
          ${escapeHTML([a.addressLine1, a.addressLine2].filter(Boolean).join(', '))},<br/>
          ${escapeHTML(a.city)}, ${escapeHTML(a.state)} ${escapeHTML(a.postalCode)}, ${escapeHTML(a.country)}
        </span>
        <span class="addr-actions">
          <button class="btn btn-outline btn-sm" type="button" data-addr-edit="${escapeHTML(a.id)}">Edit</button>
          ${a.isDefault ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-addr-default="${escapeHTML(a.id)}">Set default</button>`}
          <button class="btn btn-ghost btn-sm" type="button" data-addr-delete="${escapeHTML(a.id)}"
            aria-label="Delete address">${ICON_TRASH}</button>
        </span>
      </label>`).join('');

    list.querySelectorAll('input[name="ship-addr"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedAddressId = input.value;
        renderAddresses();
      });
    });
    list.querySelectorAll('[data-addr-edit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        editingId = btn.dataset.addrEdit;
        renderAddressForm(addresses.find((a) => a.id === editingId));
      });
    });
    list.querySelectorAll('[data-addr-default]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await guard(async () => {
          await api(`/users/addresses/${encodeURIComponent(btn.dataset.addrDefault)}`, {
            method: 'PUT', auth: true, body: { isDefault: true },
          });
          await reloadAddresses();
          showToast('Default address updated');
        });
      });
    });
    list.querySelectorAll('[data-addr-delete]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await guard(async () => {
          await api(`/users/addresses/${encodeURIComponent(btn.dataset.addrDelete)}`, { method: 'DELETE', auth: true });
          await reloadAddresses();
          showToast('Address deleted');
        });
      });
    });
  }

  function renderAddressForm(addr) {
    const wrap = document.getElementById('addr-form-wrap');
    const v = addr || { country: 'India' };
    wrap.innerHTML = `
      <form class="addr-form" id="addr-form">
        <label class="full">Full name *
          <input class="input" name="fullName" required minlength="2" maxlength="120" value="${escapeHTML(v.fullName || '')}" /></label>
        <label>Phone *
          <input class="input" name="phone" required pattern="\\+?[0-9][0-9\\s\\-]{7,14}"
            title="8–15 digits; spaces/hyphens allowed; optional +" value="${escapeHTML(v.phone || '')}" /></label>
        <label>Postal code *
          <input class="input" name="postalCode" required pattern="[A-Za-z0-9][A-Za-z0-9\\s\\-]{2,9}"
            title="3–10 letters/digits; spaces/hyphens allowed" value="${escapeHTML(v.postalCode || '')}" /></label>
        <label class="full">Address line 1 *
          <input class="input" name="addressLine1" required maxlength="200" value="${escapeHTML(v.addressLine1 || '')}" /></label>
        <label class="full">Address line 2
          <input class="input" name="addressLine2" maxlength="200" value="${escapeHTML(v.addressLine2 || '')}" /></label>
        <label>City *
          <input class="input" name="city" required maxlength="100" value="${escapeHTML(v.city || '')}" /></label>
        <label>State *
          <input class="input" name="state" required maxlength="100" value="${escapeHTML(v.state || '')}" /></label>
        <label>Country
          <input class="input" name="country" maxlength="100" value="${escapeHTML(v.country || 'India')}" /></label>
        <label style="display:flex;align-items:center;gap:8px" class="full">
          <input type="checkbox" name="isDefault" ${v.isDefault ? 'checked' : ''}/> Set as default address</label>
        <div class="full" style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" type="submit">${addr ? 'Save changes' : 'Add address'}</button>
          <button class="btn btn-ghost btn-sm" type="button" id="addr-cancel">Cancel</button>
        </div>
      </form>`;
    document.getElementById('addr-cancel').addEventListener('click', closeForm);
    document.getElementById('addr-form').addEventListener('submit', onAddressSubmit);
  }

  function closeForm() {
    editingId = null;
    document.getElementById('addr-form-wrap').innerHTML = '';
  }

  async function onAddressSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }

    const body = {};
    ['fullName', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'].forEach((f) => {
      body[f] = form.elements[f].value.trim();
    });
    body.isDefault = form.elements.isDefault.checked;

    await guard(async () => {
      if (editingId && editingId !== 'new') {
        await api(`/users/addresses/${encodeURIComponent(editingId)}`, { method: 'PUT', auth: true, body });
        showToast('Address updated');
      } else {
        await api('/users/addresses', { method: 'POST', auth: true, body });
        showToast('Address added');
      }
      closeForm();
      await reloadAddresses();
    });
  }

  async function reloadAddresses() {
    const res = await api('/users/addresses', { auth: true });
    addresses = res.data;
    if (!addresses.some((a) => a.id === selectedAddressId)) {
      selectedAddressId = (addresses.find((a) => a.isDefault) || addresses[0] || {}).id || null;
    }
    renderAddresses();
  }

  /* ---------- items & summary ---------- */
  function renderItems() {
    const box = document.getElementById('co-items');
    const { items, itemCount } = getCartMirror();

    if (!items.length) {
      box.innerHTML = `
        <div class="empty-state">
          <h3>Your cart is empty</h3>
          <a class="btn btn-primary" href="${pageURL('products.html')}">Browse products</a>
        </div>`;
      hidePlaceOrder(true);
      return;
    }
    hidePlaceOrder(false);

    box.innerHTML = items.map((line) => `
      <div class="co-item">
        <span>${escapeHTML(line.product.name)} × ${line.quantity}</span>
        <span>${formatINR(line.product.price * line.quantity)}</span>
      </div>`).join('')
      + `<p class="text-muted" style="margin:10px 0 0">${itemCount} item(s)</p>`;
  }

  function renderSummary() {
    const { subtotal, itemCount } = getCartMirror();
    const delivery = itemCount === 0 ? 0 : (subtotal >= Store.FREE_DELIVERY_OVER ? 0 : Store.DELIVERY_FEE);
    const total = subtotal + delivery;
    const summary = document.getElementById('co-summary');

    summary.innerHTML = `
      <h2>4 · Price Summary</h2>
      <p class="sum-row"><span>Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})</span><span>${formatINR(subtotal)}</span></p>
      <p class="sum-row"><span>Discount</span><span>—</span></p>
      <p class="sum-row"><span>Shipping</span>${delivery === 0 ? '<span class="free">FREE</span>' : `<span>${formatINR(delivery)}</span>`}</p>
      <p class="sum-row"><span>Tax (5% GST)</span><span>${formatINR(Math.round(subtotal * 5) / 100)}</span></p>
      <p class="sum-row sum-total"><span>Total</span><span>${formatINR(total)}</span></p>
      <p class="text-muted" style="font-size:.85rem">Final totals are calculated securely by the server when you place the order.</p>
      <button class="btn btn-primary btn-block" type="button" id="place-order-btn" style="margin-top:10px">Place Order</button>`;

    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
  }

  function hidePlaceOrder(hide) {
    const btn = document.getElementById('place-order-btn');
    if (btn) btn.disabled = hide;
  }

  /* ---------- place order ---------- */
  async function placeOrder() {
    if (busy) return;
    if (!selectedAddressId) { showToast('Please choose or add a delivery address.'); return; }

    busy = true;
    const btn = document.getElementById('place-order-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing order…'; }

    const paymentMethod = (document.querySelector('input[name="pay"]:checked') || { value: 'cod' }).value;

    try {
      /* Step 1 — create the order (server computes totals; stock reserved). */
      const res = await api('/orders', {
        method: 'POST', auth: true,
        body: { addressId: selectedAddressId, paymentMethod },
      });
      const order = res.data;

      /* Step 2 — COD is done; online orders go through Razorpay now. */
      if (paymentMethod === 'razorpay') {
        try {
          await payWithRazorpay(String(order._id));
          order.paymentStatus = 'paid';
          renderConfirmation(order);
          return;
        } catch (payErr) {
          /* Order exists but unpaid — user can retry from My Orders. */
          showToast(payErr.message);
          renderUnpaidConfirmation(order);
          return;
        }
      }

      /* Step 3 — COD success path. */
      cartState = { items: [], itemCount: 0, subtotal: 0 };
      updateBadges();
      renderConfirmation(order);
    } catch (err) {
      showToast(err.message);
      /* Server reported failure — cart UI stays untouched (spec §23). */
      if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
    } finally {
      busy = false;
    }
  }

  function renderConfirmation(order) {
    const paid = order.paymentStatus === 'paid';
    root.innerHTML = `
      <div class="co-section confirm-box">
        <h2>${paid ? '✓ Payment successful — order placed!' : '✓ Order placed successfully!'}</h2>
        <p>${paid
          ? 'Your payment was verified and your order is confirmed.'
          : 'Pay cash when your order arrives.'}</p>
        <p><strong>Order ID:</strong> ${escapeHTML(order.orderNumber)}</p>
        <p><strong>Total:</strong> ${formatINR(order.total)}</p>
        <p><strong>Status:</strong> ${escapeHTML(order.orderStatus)} · Payment: ${escapeHTML(order.paymentStatus)}</p>
        <p class="text-muted">${order.itemCount} item(s) → ${escapeHTML(order.shippingAddress.fullName)},
          ${escapeHTML(order.shippingAddress.city)}</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
          <a class="btn btn-primary" href="${pageURL('orders.html')}">View My Orders</a>
          <a class="btn btn-outline" href="${pageURL('products.html')}">Continue shopping</a>
        </div>
      </div>`;
  }

  /** Order created but online payment didn't complete — retryable, NOT lost. */
  function renderUnpaidConfirmation(order) {
    cartState = { items: [], itemCount: 0, subtotal: 0 };
    updateBadges();
    root.innerHTML = `
      <div class="co-section confirm-box">
        <h2>Order saved — payment incomplete</h2>
        <p>Your order <strong>#${escapeHTML(order.orderNumber)}</strong> (${formatINR(order.total)})
          is safe and unpaid. You can pay anytime from My Orders.</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
          <a class="btn btn-primary" href="${pageURL('orders.html')}">Go to My Orders to retry payment</a>
          <a class="btn btn-outline" href="${pageURL('products.html')}">Continue shopping</a>
        </div>
      </div>`;
  }

  /* ---------- shared ---------- */
  async function guard(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); }
    catch (err) { showToast(err.message); }
    finally { busy = false; }
  }
})();

/* ==========================================================================
   NovaMart — orders.js
   Shared by orders.html (list) and order-details.html (single order).

   Both views are strictly server-backed and owner-scoped (the API only ever
   returns the authenticated user's orders). Guests are redirected to login.
   Unpaid online orders get a [Pay Now] retry that reuses the SAME order.
   ========================================================================== */

'use strict';

(function () {
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const listRoot = document.getElementById('orders-root');
    const detailRoot = document.getElementById('order-details-root');
    if (!listRoot && !detailRoot) return;

    if (!isLoggedIn()) {
      promptLogin('Please log in to view your orders.');
      const root = listRoot || detailRoot;
      root.innerHTML = '<div class="empty-state"><h3>Login required</h3><p class="text-muted">Redirecting…</p></div>';
      return;
    }

    if (listRoot) initList(listRoot);
    else initDetails(detailRoot);
  }

  /** Unpaid online orders that aren't cancelled can be retried. */
  function isPayable(order) {
    return order.paymentMethod === 'razorpay'
      && order.paymentStatus === 'pending'
      && order.orderStatus !== 'cancelled';
  }

  /* ================= LIST VIEW ================= */
  function initList(root) {
    let page = Math.max(1, parseInt(new URLSearchParams(location.search).get('page'), 10) || 1);
    const LIMIT = 10;

    async function load() {
      root.innerHTML = '<p class="text-muted">Loading your orders…</p>';
      try {
        const res = await api(`/orders?page=${page}&limit=${LIMIT}`, { auth: true });
        render(res.data);
      } catch (err) {
        root.innerHTML = `
          <div class="empty-state">
            <h3>Could not load orders</h3>
            <p class="text-muted">${escapeHTML(err.message)}</p>
          </div>`;
      }
    }

    function render(data) {
      const { orders, pagination } = data;
      if (!orders.length) {
        root.innerHTML = `
          <div class="empty-state">
            <h3>No orders yet</h3>
            <p class="text-muted">When you place an order it will show up here.</p>
            <a class="btn btn-primary" href="${pageURL('products.html')}">Start shopping</a>
          </div>`;
        return;
      }

      root.innerHTML = `<div class="addr-list">
        ${orders.map((o) => `
          <div class="addr-card" style="cursor:default;align-items:center">
            <span class="addr-body">
              <span class="addr-name">#${escapeHTML(o.orderNumber)}</span><br/>
              ${new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              · ${o.itemCount} item(s)
            </span>
            <span style="text-align:right">
              <strong>${formatINR(o.total)}</strong><br/>
              <span class="text-muted" data-status-line="${escapeHTML(o.id)}">${escapeHTML(o.orderStatus)} · payment ${escapeHTML(o.paymentStatus)}</span>
            </span>
            <span style="display:flex;flex-direction:column;gap:6px">
              <a class="btn btn-outline btn-sm" href="${pageURL('order-details.html')}?id=${encodeURIComponent(o.id)}">View Details</a>
              ${isPayable(o) ? `<button class="btn btn-primary btn-sm" type="button" data-pay-now="${escapeHTML(o.id)}">Pay Now</button>` : ''}
            </span>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-outline btn-sm" type="button" id="prev-page" ${pagination.page <= 1 ? 'disabled' : ''}>← Previous</button>
        <span class="text-muted" style="align-self:center">Page ${pagination.page} of ${pagination.pages}</span>
        <button class="btn btn-outline btn-sm" type="button" id="next-page" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Next →</button>
      </div>`;

      /* Pagination */
      document.getElementById('prev-page').addEventListener('click', () => { page -= 1; load(); });
      document.getElementById('next-page').addEventListener('click', () => { page += 1; load(); });

      /* Retry payment for unpaid online orders — reuses the SAME order (no duplicates). */
      root.querySelectorAll('[data-pay-now]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const { order } = await payWithRazorpay(btn.dataset.payNow);
            showToast('Payment verified — thank you!');
            const line = document.querySelector(`[data-status-line="${CSS.escape(String(order._id))}"]`);
            if (line) line.textContent = `${order.orderStatus} · payment ${order.paymentStatus}`;
          } catch (err) {
            showToast(err.message);
            btn.disabled = false;
          }
        });
      });
    }

    load();
  }

  /* ================= DETAIL VIEW ================= */
  function initDetails(root) {
    const id = new URLSearchParams(location.search).get('id');

    async function load() {
      root.innerHTML = '<p class="text-muted">Loading order…</p>';
      try {
        const res = await api(`/orders/${encodeURIComponent(id)}`, { auth: true });
        render(res.data);
      } catch (err) {
        root.innerHTML = `
          <div class="empty-state">
            <h3>Order not found</h3>
            <p class="text-muted">${escapeHTML(err.message)}</p>
            <a class="btn btn-outline" href="${pageURL('orders.html')}">Back to My Orders</a>
          </div>`;
      }
    }

    function render(order) {
      const a = order.shippingAddress;
      const cancellable = ['pending', 'confirmed'].includes(order.orderStatus);
      const payable = isPayable(order);

      root.innerHTML = `
        <section class="co-section">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <h2 style="margin:0">Order #${escapeHTML(order.orderNumber)}</h2>
            <span>${new Date(order.createdAt).toLocaleString('en-IN')}</span>
          </div>
          <p style="margin:8px 0 0">
            Status: <strong id="detail-status">${escapeHTML(order.orderStatus)}</strong> ·
            Payment: <strong>${escapeHTML(order.paymentMethod)}</strong> (<span id="detail-paystatus">${escapeHTML(order.paymentStatus)}</span>)
          </p>
          ${payable ? '<button class="btn btn-primary btn-sm" type="button" id="pay-now-btn" style="margin-top:10px">Pay Now</button>' : ''}
          ${cancellable ? '<button class="btn btn-ghost btn-sm" type="button" id="cancel-btn" style="margin-top:10px">Cancel order</button>' : ''}
        </section>

        <section class="co-section">
          <h2>Items (${order.itemCount})</h2>
          ${order.items.map((item) => `
            <div class="co-item">
              <span>${escapeHTML(item.name)} × ${item.quantity}</span>
              <span>${formatINR(item.price * item.quantity)}</span>
            </div>`).join('')}
        </section>

        <section class="co-section cart-summary">
          <h2>Summary</h2>
          <p class="sum-row"><span>Subtotal</span><span>${formatINR(order.subtotal)}</span></p>
          <p class="sum-row"><span>Discount</span><span>${order.discount ? `−${formatINR(order.discount)}` : '—'}</span></p>
          <p class="sum-row"><span>Shipping</span>${order.shippingFee === 0 ? '<span class="free">FREE</span>' : `<span>${formatINR(order.shippingFee)}</span>`}</p>
          <p class="sum-row"><span>Tax</span><span>${formatINR(order.tax)}</span></p>
          <p class="sum-row sum-total"><span>Total</span><span>${formatINR(order.total)}</span></p>
        </section>

        <section class="co-section">
          <h2>Delivery Address</h2>
          <p style="margin:0;line-height:1.6">
            <strong>${escapeHTML(a.fullName)}</strong><br/>
            ${escapeHTML([a.addressLine1, a.addressLine2].filter(Boolean).join(', '))}<br/>
            ${escapeHTML(a.city)}, ${escapeHTML(a.state)} ${escapeHTML(a.postalCode)}<br/>
            ${escapeHTML(a.country)} · ${escapeHTML(a.phone)}
          </p>
        </section>

        <a class="btn btn-outline" href="${pageURL('orders.html')}">← Back to My Orders</a>`;

      const cancelBtn = document.getElementById('cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);

      const payBtn = document.getElementById('pay-now-btn');
      if (payBtn) {
        payBtn.addEventListener('click', async () => {
          payBtn.disabled = true;
          try {
            const { order: updated } = await payWithRazorpay(id);
            showToast('Payment verified — thank you!');
            render(updated); // re-render as a paid order
          } catch (err) {
            showToast(err.message);
            payBtn.disabled = false;
          }
        });
      }
    }

    async function onCancel() {
      if (!confirm('Cancel this order? Reserved stock will be returned.')) return;
      try {
        await api(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', auth: true });
        showToast('Order cancelled');
        load();
      } catch (err) {
        showToast(err.message);
      }
    }

    load();
  }
})();

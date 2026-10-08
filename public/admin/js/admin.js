/* ==========================================================================
   NovaMart Admin — admin.js
   Page controllers dispatched by <body data-page="...">.
   All data comes from /api/admin/* (server-computed, admin-gated).
   ========================================================================== */

'use strict';

(function () {
  const { boot, api, esc, formatINR, fmtDate, toast, meta } = ADMIN;
  const page = document.body.dataset.page;

  /* ================= shared table helpers ================= */
  function pagerHTML(p) {
    return `
      <div class="a-pager">
        <button class="btn" id="pg-prev" ${p.page <= 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${p.page} of ${Math.max(1, p.pages)} · ${p.total} total</span>
        <button class="btn" id="pg-next" ${p.page >= p.pages ? 'disabled' : ''}>Next â†’</button>
      </div>`;
  }
  function bindPager(container, loadFn, pageRef) {
    const prev = container.querySelector('#pg-prev');
    const next = container.querySelector('#pg-next');
    if (prev) prev.addEventListener('click', () => { pageRef.page--; loadFn(); });
    if (next) next.addEventListener('click', () => { pageRef.page++; loadFn(); });
  }
  function chip(kind, label) { return `<span class="chip ${kind}">${esc(label)}</span>`; }

  function stockChip(stock) {
    if (stock === 0) return chip('bad', 'Out of stock');
    const t = meta().lowStockThreshold;
    if (stock <= t) return chip('warn', `Low (â‰¤ ${t})`);
    return chip('ok', 'In stock');
  }
  function statusChip(status) {
    const map = {
      pending: 'warn', confirmed: 'info', processing: 'info', shipped: 'info',
      delivered: 'ok', cancelled: 'bad',
    };
    return chip(map[status] || 'info', status);
  }
  function payChip(status) {
    return chip({ paid: 'ok', failed: 'bad', refunded: 'warn' }[status] || 'neutral', `payment: ${status}`);
  }

  /* ================= DASHBOARD ================= */
  async function runDashboard(root) {
    root.innerHTML = '<p class="a-loading">Loading store metrics…</p>';
    const d = (await api('/admin/dashboard')).data;

    const cards = [
      ['Total Users', d.totalUsers],
      ['Total Products', `${d.totalProducts} <small>(${d.activeProducts} active)</small>`],
      ['Total Orders', d.totalOrders],
      ['Pending Orders', `${d.pendingOrders} <small>(+${d.processingOrders} processing)</small>`],
      ['Completed Orders', d.completedOrders],
      ['Total Revenue', formatINR(d.totalRevenue)],
    ];

    root.innerHTML = `
      <div class="cards">
        ${cards.map(([label, val]) => `<div class="card"><div class="card-label">${label}</div><div class="card-value">${val}</div></div>`).join('')}
      </div>
      <h2>Low &amp; out of stock <small class="muted">(threshold â‰¤ ${d.lowStockThreshold})</small></h2>
      ${d.lowStockProducts.length === 0
        ? '<p class="muted">Nothing low on stock. ðŸŽ‰</p>'
        : `<table class="tbl"><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
           <tbody>${d.lowStockProducts.map((p) => `
             <tr>
               <td>${esc(p.name)}</td>
               <td>${formatINR(p.price)}</td>
               <td>${p.stock}</td>
               <td>${stockChip(p.stock)}</td>
             </tr>`).join('')}</tbody></table>`}
      <p class="muted">Revenue counts every non-cancelled order; payment status is tracked separately per order.</p>`;
  }

  /* ================= PRODUCTS ================= */
  async function runProducts(root) {
    const state = { search: '', category: 'all', status: 'all', page: 1 };
    const cats = meta().productCategories;

    root.innerHTML = `
      <div class="toolbar">
        <input id="p-search" type="search" placeholder="Search name or brand...">
        <select id="p-cat"><option value="all">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <select id="p-status">
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <button class="btn-primary" id="p-add">ï¼‹ Add product</button>
      </div>
      <div id="p-form-wrap"></div>
      <div id="p-table"></div>`;

    const formWrap = root.querySelector('#p-form-wrap');
    const tableWrap = root.querySelector('#p-table');

    function openForm(product) {
      const p = product || {};
      formWrap.innerHTML = `
        <form id="p-form" class="panel">
          <h3>${product ? 'Edit product' : 'Add product'}</h3>
          <div class="grid2">
            <label>Name<input name="name" required maxlength="120" value="${esc(p.name || '')}"></label>
            <label>Brand<input name="brand" maxlength="100" value="${esc(p.brand || '')}"></label>
            <label>Category<select name="category" required>${cats.map((c) => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label>Price (₹)<input name="price" type="number" step="0.01" min="0.01" required value="${p.price ?? ''}"></label>
            <label>Original price (₹)<input name="originalPrice" type="number" step="0.01" min="0.01" value="${p.originalPrice ?? ''}"></label>
            <label>Stock<input name="stock" type="number" step="1" min="0" required value="${p.stock ?? 0}"></label>
          </div>
          <label>Description<textarea name="description" rows="3" required>${esc(p.description || '')}</textarea></label>
          <label>Image URLs (one per line)<textarea name="images" rows="2" placeholder="https://...">${esc((p.images || []).join('\n'))}</textarea></label>
          <div class="checks">
            <label><input type="checkbox" name="isFeatured" ${p.isFeatured ? 'checked' : ''}> Featured</label>
            <label><input type="checkbox" name="isActive" ${product ? (p.isActive ? 'checked' : '') : 'checked'}> Active</label>
          </div>
          <div class="row-end">
            <button type="button" class="btn" id="p-cancel">Cancel</button>
            <button type="submit" class="btn-primary">${product ? 'Save changes' : 'Create product'}</button>
          </div>
        </form>`;
      formWrap.querySelector('#p-cancel').addEventListener('click', () => { formWrap.innerHTML = ''; });

      formWrap.querySelector('#p-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = {
          name: fd.get('name').trim(),
          brand: fd.get('brand').trim(),
          category: fd.get('category'),
          price: Number(fd.get('price')),
          stock: Number(fd.get('stock')),
          description: fd.get('description').trim(),
          images: fd.get('images').split('\n').map((s) => s.trim()).filter(Boolean),
          isFeatured: fd.get('isFeatured') === 'on',
          isActive: fd.get('isActive') === 'on',
        };
        const orig = fd.get('originalPrice');
        if (orig) body.originalPrice = Number(orig);

        try {
          if (product) {
            await api(`/admin/products/${product.id}`, { method: 'PUT', body });
            toast('Product updated.');
          } else {
            await api('/admin/products', { method: 'POST', body });
            toast('Product created.');
          }
          formWrap.innerHTML = '';
          load();
        } catch (err) { toast(err.message, true); }
      });
      formWrap.scrollIntoView({ behavior: 'smooth' });
    }

    async function load() {
      tableWrap.innerHTML = '<p class="a-loading">Loading products…</p>';
      const qs = new URLSearchParams({
        search: state.search, category: state.category,
        status: state.status, page: state.page, limit: 10,
      });
      const { products, pagination } = (await api(`/admin/products?${qs}`)).data;

      tableWrap.innerHTML = products.length === 0
        ? '<p class="muted">No products match.</p>'
        : `<table class="tbl"><thead><tr>
             <th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>State</th><th></th>
           </tr></thead><tbody>
           ${products.map((p) => `
             <tr data-id="${p.id}">
               <td><strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.brand || '')}</small></td>
               <td>${esc(p.category)}</td>
               <td>${formatINR(p.price)}</td>
               <td>${p.stock}</td>
               <td>${p.isActive ? chip('ok', 'active') : chip('bad', 'inactive')}</td>
               <td class="row-actions">
                 <button class="btn btn-sm" data-act="edit">Edit</button>
                 <button class="btn btn-sm" data-act="toggle">${p.isActive ? 'Deactivate' : 'Activate'}</button>
                 <button class="btn btn-sm danger" data-act="delete">Delete</button>
               </td>
             </tr>`).join('')}</tbody></table>${pagerHTML(pagination)}`;

      bindPager(tableWrap, load, state);

      tableWrap.querySelectorAll('tr[data-id]').forEach((tr) => {
        const product = products.find((x) => x.id === tr.dataset.id);
        tr.querySelectorAll('[data-act]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const act = btn.dataset.act;
            try {
              if (act === 'edit') openForm(product);
              else if (act === 'toggle') {
                await api(`/admin/products/${product.id}`, { method: 'PUT', body: { isActive: !product.isActive } });
                toast(product.isActive ? 'Product deactivated.' : 'Product activated.');
                load();
              } else if (act === 'delete') {
                if (!confirm(`Soft-delete "${product.name}"? It disappears from the storefront but data is kept.`)) return;
                await api(`/admin/products/${product.id}`, { method: 'DELETE' });
                toast('Product deleted (soft).');
                load();
              }
            } catch (err) { toast(err.message, true); }
          });
        });
      });
    }

    root.querySelector('#p-search').addEventListener('input', (e) => {
      clearTimeout(load._t);
      load._t = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300);
    });
    root.querySelector('#p-cat').addEventListener('change', (e) => { state.category = e.target.value; state.page = 1; load(); });
    root.querySelector('#p-status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
    root.querySelector('#p-add').addEventListener('click', () => openForm(null));

    load();
  }

  /* ================= INVENTORY ================= */
  async function runInventory(root) {
    const state = { page: 1 };
    root.innerHTML = '<div id="inv-body"><p class="a-loading">Loading inventory…</p></div>';
    const body = root.querySelector('#inv-body');

    async function load() {
      const { items, pagination, lowStockThreshold } = (await api(`/admin/inventory?page=${state.page}&limit=20`)).data;

      body.innerHTML = `
        <p class="muted">Low-stock threshold: â‰¤ ${lowStockThreshold} units (server-defined).</p>
        <table class="tbl"><thead><tr><th>Product</th><th>Category</th><th>Current stock</th><th>Status</th><th>Set stock</th></tr></thead>
        <tbody>${items.map((it) => `
          <tr>
            <td><strong>${esc(it.name)}</strong></td>
            <td>${esc(it.category)}</td>
            <td>${it.stock}</td>
            <td>${it.status === 'out' ? chip('bad', 'Out of stock') : it.status === 'low' ? chip('warn', 'Low stock') : chip('ok', 'In stock')}</td>
            <td class="stock-edit">
              <input type="number" min="0" step="1" value="${it.stock}" data-stock-input="${it.id}">
              <button class="btn btn-sm" data-save="${it.id}">Save</button>
            </td>
          </tr>`).join('')}</tbody></table>${pagerHTML(pagination)}`;

      bindPager(body, load, state);
      body.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const input = body.querySelector(`[data-stock-input="${btn.dataset.save}"]`);
          try {
            await api(`/admin/inventory/${btn.dataset.save}/stock`, { method: 'PUT', body: { stock: Number(input.value) } });
            toast('Stock updated.');
            load();
          } catch (err) { toast(err.message, true); }
        });
      });
    }
    load();
  }

  /* ================= ORDERS ================= */
  async function runOrders(root) {
    const state = { status: 'all', page: 1 };

    root.innerHTML = `
      <div class="toolbar">
        <select id="o-status">
          <option value="all">All statuses</option>
          ${meta().orderStatuses.map((s) => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div id="o-table"></div>
      <div id="o-detail"></div>`;

    const tableWrap = root.querySelector('#o-table');
    const detailWrap = root.querySelector('#o-detail');

    async function load() {
      tableWrap.innerHTML = '<p class="a-loading">Loading orders…</p>';
      const qs = new URLSearchParams({ status: state.status, page: state.page, limit: 10 });
      const { orders, pagination } = (await api(`/admin/orders?${qs}`)).data;

      tableWrap.innerHTML = orders.length === 0
        ? '<p class="muted">No orders match this filter.</p>'
        : `<table class="tbl row-click"><thead><tr>
            <th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Payment</th><th>Status</th>
          </tr></thead><tbody>
          ${orders.map((o) => `
            <tr data-order="${o.id}" tabindex="0">
              <td>#${esc(o.orderNumber)}</td>
              <td>${esc(o.customer?.name || '—')}<br><small class="muted">${esc(o.customer?.email || '')}</small></td>
              <td>${fmtDate(o.createdAt)}</td>
              <td>${formatINR(o.total)}</td>
              <td>${payChip(o.paymentStatus)}</td>
              <td>${statusChip(o.orderStatus)}</td>
            </tr>`).join('')}</tbody></table>${pagerHTML(pagination)}`;

      bindPager(tableWrap, load, state);
      tableWrap.querySelectorAll('tr[data-order]').forEach((tr) => {
        tr.addEventListener('click', () => openDetail(tr.dataset.order));
      });
    }

    async function openDetail(id) {
      detailWrap.innerHTML = '<p class="a-loading">Loading order…</p>';
      const o = (await api(`/admin/orders/${id}`)).data;
      const transitions = meta().statusTransitions[o.orderStatus] || [];
      const a = o.shippingAddress;

      detailWrap.innerHTML = `
        <div class="panel" id="order-panel">
          <div class="row-between">
            <h3>Order #${esc(o.orderNumber)} ${statusChip(o.orderStatus)} ${payChip(o.paymentStatus)}</h3>
            <button class="btn btn-sm" id="od-close">âœ•</button>
          </div>
          <p class="muted">Placed ${new Date(o.createdAt).toLocaleString('en-IN')} · ${esc(o.paymentMethod)} · customer
            <strong>${esc(o.customer?.name || '—')}</strong> (${esc(o.customer?.email || '—')})</p>
          <div class="grid2">
            <div>
              <h4>Items (${o.itemCount})</h4>
              <ul class="plain">${o.items.map((it) => `
                <li>${esc(it.name)} Ã— ${it.quantity} — ${formatINR(it.price * it.quantity)}</li>`).join('')}</ul>
              <h4>Shipping address</h4>
              <p>${esc(a.fullName)}<br>${esc([a.addressLine1, a.addressLine2].filter(Boolean).join(', '))}<br>
                ${esc(a.city)}, ${esc(a.state)} ${esc(a.postalCode)}, ${esc(a.country)} · ${esc(a.phone)}</p>
            </div>
            <div>
              <h4>Totals (server-recorded)</h4>
              <ul class="plain">
                <li>Subtotal: ${formatINR(o.subtotal)}</li>
                <li>Discount: ${o.discount ? '−' + formatINR(o.discount) : '—'}</li>
                <li>Shipping: ${o.shippingFee === 0 ? 'FREE' : formatINR(o.shippingFee)}</li>
                <li>Tax: ${formatINR(o.tax)}</li>
                <li><strong>Total: ${formatINR(o.total)}</strong></li>
              </ul>
              <h4>Update status</h4>
              ${transitions.length > 0 ? `
                <div class="row-gap">
                  <select id="od-next">${transitions.map((s) => `<option>${s}</option>`).join('')}</select>
                  <button class="btn-primary btn-sm" id="od-apply">Apply</button>
                </div>
                <p class="muted">Allowed from "${esc(o.orderStatus)}": ${transitions.map(esc).join(', ')}. Cancelling restores stock automatically.</p>`
                : `<p class="muted">No further transitions from "${esc(o.orderStatus)}".</p>`}
            </div>
          </div>
        </div>`;

      detailWrap.querySelector('#od-close').addEventListener('click', () => { detailWrap.innerHTML = ''; });
      const apply = detailWrap.querySelector('#od-apply');
      if (apply) apply.addEventListener('click', async () => {
        const next = detailWrap.querySelector('#od-next').value;
        try {
          await api(`/admin/orders/${id}/status`, { method: 'PUT', body: { orderStatus: next } });
          toast(`Order moved to ${next}.`);
          load();
          openDetail(id);
        } catch (err) { toast(err.message, true); }
      });
      detailWrap.scrollIntoView({ behavior: 'smooth' });
    }

    root.querySelector('#o-status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
    load();
  }

  /* ================= USERS ================= */
  async function runUsers(root) {
    const state = { search: '', page: 1 };
    const me = JSON.parse(localStorage.getItem('novamart_auth_v1'));

    root.innerHTML = `
      <div class="toolbar"><input id="u-search" type="search" placeholder="Search name or email..."></div>
      <div id="u-table"></div>
      <div id="u-detail"></div>`;

    const tableWrap = root.querySelector('#u-table');
    const detailWrap = root.querySelector('#u-detail');

    async function load() {
      tableWrap.innerHTML = '<p class="a-loading">Loading users…</p>';
      const qs = new URLSearchParams({ search: state.search, page: state.page, limit: 10 });
      const { users, pagination } = (await api(`/admin/users?${qs}`)).data;

      tableWrap.innerHTML = users.length === 0
        ? '<p class="muted">No users match.</p>'
        : `<table class="tbl row-click"><thead><tr>
            <th>User</th><th>Role</th><th>Joined</th><th>Account</th><th></th>
          </tr></thead><tbody>
          ${users.map((u) => `
            <tr data-user="${u.id}" tabindex="0">
              <td><strong>${esc(u.name)}</strong><br><small class="muted">${esc(u.email)}</small></td>
              <td>${chip(u.role === 'admin' ? 'info' : 'neutral', u.role)}</td>
              <td>${fmtDate(u.createdAt)}</td>
              <td>${u.isActive ? chip('ok', 'active') : chip('bad', 'deactivated')}</td>
              <td>${String(u.id) === String(me?.user?.id ?? me?.user?._id) ? '<span class="muted">(you)</span>' : ''}</td>
            </tr>`).join('')}</tbody></table>${pagerHTML(pagination)}`;

      bindPager(tableWrap, load, state);
      tableWrap.querySelectorAll('tr[data-user]').forEach((tr) => {
        tr.addEventListener('click', () => openDetail(tr.dataset.user));
      });
    }

    async function openDetail(id) {
      detailWrap.innerHTML = '<p class="a-loading">Loading user…</p>';
      const u = (await api(`/admin/users/${id}`)).data;
      const isSelf = String(u.id) === String(me?.user?.id ?? me?.user?._id);

      detailWrap.innerHTML = `
        <div class="panel">
          <div class="row-between">
            <h3>${esc(u.name)} ${chip(u.role === 'admin' ? 'info' : 'neutral', u.role)}
              ${u.isActive ? chip('ok', 'active') : chip('bad', 'deactivated')}</h3>
            <button class="btn btn-sm" id="ud-close">âœ•</button>
          </div>
          <p class="muted">${esc(u.email)} · joined ${fmtDate(u.createdAt)} · phone: ${esc(u.phone || '—')}</p>
          <p>Orders placed: <strong>${u.orderCount}</strong> · Lifetime value (non-cancelled): <strong>${formatINR(u.lifetimeValue)}</strong></p>
          <p>Saved addresses: <strong>${(u.addresses || []).length}</strong></p>
          <div class="row-gap">
            ${isSelf
              ? '<p class="muted">You cannot deactivate your own account.</p>'
              : `<button class="btn ${u.isActive ? 'danger' : 'btn-primary'}" id="ud-toggle">
                   ${u.isActive ? 'Deactivate account' : 'Activate account'}</button>
                 <p class="muted">Deactivated users cannot log in (enforced by the existing auth system).</p>`}
          </div>
        </div>`;

      detailWrap.querySelector('#ud-close').addEventListener('click', () => { detailWrap.innerHTML = ''; });
      const toggle = detailWrap.querySelector('#ud-toggle');
      if (toggle) toggle.addEventListener('click', async () => {
        try {
          const res = await api(`/admin/users/${id}`, { method: 'PUT', body: { isActive: !u.isActive } });
          toast(res.message || 'Updated.');
          load();
          openDetail(id);
        } catch (err) { toast(err.message, true); }
      });
    }

    root.querySelector('#u-search').addEventListener('input', (e) => {
      clearTimeout(load._t);
      load._t = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300);
    });
    load();
  }

  /* ================= REVIEWS (Phase 10 moderation) ================= */
  async function runReviews(root) {
    const state = { status: 'pending', page: 1, limit: 20 };

    root.innerHTML = `
      <div class="toolbar">
        <h1 style="margin-right:auto">Reviews</h1>
        <label class="a-label">Show
          <select id="rv-status" class="select">
            <option value="pending">Pending / hidden</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      <p class="muted" id="rv-count"></p>
      <div id="rv-list"><p class="a-loading">Loading reviews…</p></div>
      <div class="a-pager">
        <button class="btn btn-sm" type="button" id="rv-prev" disabled>← Previous</button>
        <span class="muted" id="rv-page"></span>
        <button class="btn btn-sm" type="button" id="rv-next" disabled>Next →</button>
      </div>`;

    const listEl = root.querySelector('#rv-list');
    const countEl = root.querySelector('#rv-count');
    const prevBtn = root.querySelector('#rv-prev');
    const nextBtn = root.querySelector('#rv-next');
    const pageEl = root.querySelector('#rv-page');

    async function load() {
      listEl.innerHTML = '<p class="a-loading">Loading…</p>';
      try {
        const res = await api(`/admin/reviews?status=${state.status}&page=${state.page}&limit=${state.limit}`);
        const items = res.data || [];
        countEl.textContent = `${res.pagination.total} review(s)`;
        pageEl.textContent = `Page ${res.pagination.page} of ${res.pagination.pages}`;
        prevBtn.disabled = res.pagination.page <= 1;
        nextBtn.disabled = res.pagination.page >= res.pagination.pages;

        if (!items.length) {
          listEl.innerHTML = '<div class="panel"><p class="muted">Nothing here — queue is empty. 🎉</p></div>';
          return;
        }

        listEl.innerHTML = `<table class="tbl">
          <thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${items.map((rv) => `
              <tr data-id="${esc(rv.id)}">
                <td>${esc(rv.product && rv.product.name ? rv.product.name : '(deleted product)')}</td>
                <td>${esc(rv.user && rv.user.name ? rv.user.name : '?')}<br><span class="muted">${esc(rv.user && rv.user.email ? rv.user.email : '')}</span></td>
                <td>${'★'.repeat(rv.rating)}${'☆'.repeat(5 - rv.rating)}</td>
                <td>${rv.title ? `<strong>${esc(rv.title)}</strong><br>` : ''}${esc(String(rv.comment).slice(0, 140))}${String(rv.comment).length > 140 ? '…' : ''}
                    ${rv.verifiedPurchase ? '<br><span class="chip ok">✓ verified purchase</span>' : ''}</td>
                <td>${rv.isApproved ? '<span class="chip ok">approved</span>' : '<span class="chip warn">pending</span>'}<br><span class="muted">${new Date(rv.createdAt).toLocaleDateString('en-IN')}</span></td>
                <td>
                  ${rv.isApproved
                    ? '<button class="btn btn-sm" type="button" data-act="hide">Hide</button>'
                    : '<button class="btn btn-primary btn-sm" type="button" data-act="approve">Approve</button>'}
                  <button class="btn danger btn-sm" type="button" data-act="delete">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody></table>`;

        listEl.querySelectorAll('button[data-act]').forEach((btn) => {
          btn.addEventListener('click', () => act(btn.dataset.act, btn.closest('tr').dataset.id));
        });
      } catch (err) {
        listEl.innerHTML = `<div class="panel"><p>${esc(err.message)}</p></div>`;
      }
    }

    async function act(action, id) {
      if (action === 'delete' && !confirm('Delete this review permanently?')) return;
      try {
        if (action === 'approve') await api(`/admin/reviews/${id}/status`, { method: 'PUT', body: { isApproved: true } });
        if (action === 'hide') await api(`/admin/reviews/${id}/status`, { method: 'PUT', body: { isApproved: false } });
        if (action === 'delete') await api(`/admin/reviews/${id}`, { method: 'DELETE' });
        toast(`Review ${action === 'approve' ? 'approved' : action === 'hide' ? 'hidden' : 'deleted'}.`);
        load();
      } catch (err) {
        toast(err.message, true);
      }
    }

    root.querySelector('#rv-status').addEventListener('change', (e) => {
      state.status = e.target.value; state.page = 1; load();
    });
    prevBtn.addEventListener('click', () => { state.page -= 1; load(); });
    nextBtn.addEventListener('click', () => { state.page += 1; load(); });

    await load();
  }

  /* ================= dispatch ================= */
  const RUNNERS = {
    index: runDashboard,
    dashboard: runDashboard,
    products: runProducts,
    inventory: runInventory,
    orders: runOrders,
    reviews: runReviews,
    users: runUsers,
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const runner = RUNNERS[page];
    if (!runner) return;
    let root = null;
    try {
      root = await boot(); // gate first; returns null if login panel shown
    } catch (err) {
      window.__BOOT_HANDLED = true; // tell the shell fallback a detailed panel is up
      const r = document.getElementById('admin-root');
      if (r) {
        r.innerHTML = '<div style="max-width:680px;margin:60px auto;padding:24px;border:2px solid #b02a37;' +
          'border-radius:12px;font-family:system-ui,sans-serif;color:#222">' +
          '<h3 style="margin-top:0;color:#b02a37">Boot failed — showing the real error</h3>' +
          '<pre style="white-space:pre-wrap;background:#f6f7f9;padding:12px;border-radius:8px;overflow:auto">' +
          (err && err.stack ? String(err.stack).replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) : String(err)) +
          '</pre></div>';
      }
      return;
    }
    if (root) {
      try { await runner(root); }
      catch (err) {
        root.innerHTML = `<div class="panel"><h3>Could not load this page</h3>
          <p class="muted">${esc(err.message)}</p>
          ${err.status === 403 ? '<p class="muted">Admin permission required.</p>' : ''}</div>`;
      }
    }
  });
})();

if (window.__BOOT_LOG) window.__BOOT_LOG.push('page-executed');

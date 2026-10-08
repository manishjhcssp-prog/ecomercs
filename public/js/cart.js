/* ==========================================================================
   NovaMart — cart.js
   Shopping-cart page (cart.html) — Phase 6: SERVER-BACKED.

   Renders the authenticated user's cart from GET /api/cart. Every mutation
   (quantity ±, remove, clear) calls the API via app.js helpers and re-renders
   from the fresh server response — MongoDB is the source of truth, local
   edits never override it. Guests get a login prompt instead of the cart.
   Delivery figures are DISPLAY ONLY until checkout recalculates server-side.
   ========================================================================== */

'use strict';

function initCartPage() {
  const root = document.getElementById('cart-root');
  const summaryEl = document.getElementById('cart-summary');
  if (!root || !summaryEl) return;

  let busy = false; // guards double-clicks during API round-trips

  /* ---------- rendering ---------- */
  function rowHTML(line) {
    const maxed = line.quantity >= line.product.stock;
    return `
      <article class="cart-row" data-id="${escapeHTML(line.product.id)}">
        <img src="${escapeHTML(line.product.image)}" alt="${escapeHTML(line.product.name)}" width="88" height="88">
        <div class="cart-info">
          <span class="cart-cat">${line.product.stock > 0 ? 'In stock' : 'Out of stock'}</span>
          <a class="cart-name" href="${pageURL('product-details.html')}?id=${encodeURIComponent(line.product.id)}">${escapeHTML(line.product.name)}</a>
          <p class="cart-unit">${formatINR(line.product.price)} each</p>
        </div>
        <div class="cart-row-right">
          <div class="qty qty-sm" aria-label="Quantity for ${escapeHTML(line.product.name)}">
            <button type="button" data-action="dec" aria-label="Decrease quantity">−</button>
            <output aria-live="polite">${line.quantity}</output>
            <button type="button" data-action="inc" aria-label="Increase quantity"
              ${maxed ? 'disabled title="Max stock reached"' : ''}>+</button>
          </div>
          <p class="cart-line-price">${formatINR(line.product.price * line.quantity)}</p>
          <button class="cart-remove" type="button" data-action="remove">
            ${ICON_TRASH} Remove
          </button>
        </div>
      </article>`;
  }

  function renderSummary(itemCount, subtotal) {
    const delivery = itemCount === 0 ? 0 : (subtotal >= Store.FREE_DELIVERY_OVER ? 0 : Store.DELIVERY_FEE);
    const total = subtotal + delivery;
    summaryEl.innerHTML = `
      <h2>Order Summary</h2>
      <p class="sum-row"><span>Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})</span><span>${formatINR(subtotal)}</span></p>
      <p class="sum-row"><span>Delivery</span>
        ${delivery === 0 ? '<span class="free">FREE</span>' : `<span>${formatINR(delivery)}</span>`}
      </p>
      <p class="sum-row"><span class="text-muted">Totals shown are indicative — checkout recalculates.</span></p>
      <p class="sum-row sum-total"><span>Total</span><span>${formatINR(total)}</span></p>
      <button class="btn btn-primary btn-block" type="button" id="checkout-btn">Proceed to Checkout</button>
      <button class="btn btn-ghost btn-block" type="button" id="clear-cart-btn" style="margin-top:8px">Clear cart</button>
      <a class="btn btn-ghost btn-block" href="${pageURL('products.html')}" style="margin-top:8px">Continue Shopping</a>`;
  }

  function renderCart() {
    const { items, itemCount, subtotal } = getCartMirror();

    if (!items.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>Your cart is empty</h3>
          <p>Looks like you haven't added anything yet.</p>
          <a class="btn btn-primary" href="${pageURL('products.html')}">Browse Products</a>
        </div>`;
      summaryEl.innerHTML = '';
      return;
    }

    root.innerHTML = `<div class="cart-items">${items.map(rowHTML).join('')}</div>`;
    renderSummary(itemCount, subtotal);
  }

  function renderGuestState() {
    summaryEl.innerHTML = '';
    root.innerHTML = `
      <div class="empty-state">
        <h3>Your cart awaits</h3>
        <p>Please log in — your NovaMart cart follows you across
          devices and visits.</p>
        <a class="btn btn-primary" href="${pageURL('login.html')}?next=cart.html">Log in to view your cart</a>
        <a class="btn btn-ghost" href="${pageURL('products.html')}" style="margin-left:8px">Browse products</a>
      </div>`;
  }

  /* ---------- data ---------- */
  async function refreshCart() {
    await refreshCartFromServer(); // updates mirrors + navbar badges
    renderCart();
  }

  async function mutate(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
      renderCart();
    } catch (err) {
      showToast(err.message);
      /* Re-sync with the server in case anything changed server-side */
      refreshCartFromServer().then(renderCart).catch(() => {});
    } finally {
      busy = false;
    }
  }

  /* ---------- events ---------- */
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || busy) return;
    const row = button.closest('.cart-row');
    const productId = row.dataset.id;
    const line = getCartMirror().items.find((entry) => entry.product.id === productId);
    if (!line) return;

    switch (button.dataset.action) {
      case 'inc':
        if (line.quantity >= line.product.stock) {
          showToast(`Only ${line.product.stock} unit(s) in stock.`);
          return;
        }
        mutate(() => setCartQty(productId, line.quantity + 1));
        break;
      case 'dec':
        if (line.quantity <= 1) {
          mutate(() => removeFromCart(productId));
          showToast('Item removed from cart');
          return;
        }
        mutate(() => setCartQty(productId, line.quantity - 1));
        break;
      case 'remove':
        mutate(() => removeFromCart(productId));
        break;
      default:
        break;
    }
  });

  summaryEl.addEventListener('click', (event) => {
    if (event.target.closest('#checkout-btn')) {
      location.assign(pageURL('checkout.html'));
      return;
    }
    if (event.target.closest('#clear-cart-btn')) {
      mutate(async () => {
        await clearServerCart();
        showToast('Cart cleared');
      });
    }
  });

  /* ---------- boot ---------- */
  if (!isLoggedIn()) {
    renderGuestState();
    return;
  }

  root.innerHTML = '<p class="text-muted">Loading your cart…</p>';
  refreshCart().catch((err) => {
    console.warn('[NovaMart] cart unavailable:', err.message);
    summaryEl.innerHTML = '';
    root.innerHTML = `
      <div class="empty-state">
        <h3>Cart unavailable</h3>
        <p>${escapeHTML(err.message)}</p>
        <a class="btn btn-outline" href="${pageURL('products.html')}">Continue shopping</a>
      </div>`;
  });
}

document.addEventListener('DOMContentLoaded', initCartPage);

# NovaMart — E-Commerce Website

A complete, production-ready e-commerce application built in phased increments.

> **Development state of truth:** [`agent_memory.md`](./agent_memory.md) — always read it before changing anything in this repository.

---

## Current Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation skeleton | ✅ |
| 2 | Storefront UI (catalog, product details, navbar) | ✅ |
| 3 | Backend foundation (Express, MongoDB, health, CORS, errors) | ✅ |
| 4 | Product system (CRUD, search, filters, sort, pagination, seed) | ✅ |
| 5 | Authentication (JWT, bcrypt, register/login/me, profile, roles) | ✅ |
| 6 | Cart & Wishlist (server-backed, stock guards, persistence) | ✅ |
| 7 | Checkout & Orders (addresses, COD, transactions, stock restore) | ✅ |
| 8 | Payments (Razorpay: create/verify/webhook, sandbox verified) | ✅ |
| 9 | Admin Dashboard (products, inventory, users, orders, transitions) | ✅ |
| 10 | Reviews, Ratings, Search & Store Improvements | ✅ |
| 11 | Security Hardening & Production Audit | ✅ |
| 12 | AI Personal Shopper (chat widget, function calling, cart integration) | ✅ |

**All 12 phases complete. Ready for Phase 13 (SEO, Performance & Production Optimization).**

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript (vanilla, no framework, no build step) |
| Backend | Node.js + Express.js (express@4.21+) |
| Database | MongoDB Atlas (M0) + Mongoose ODM (mongoose@8.x) |
| Auth | JWT (jsonwebtoken@9.x) + bcryptjs@3.x password hashing |
| Payments | Razorpay official Node SDK |
| AI | OpenRouter API (function calling, any compatible model) |
| Package Manager | npm · Node ≥20.12 |

---

## Project Structure

```text
ECOMERCS
│
├── .gitignore
├── README.md
├── SECURITY_AUDIT.md
├── agent_memory.md
├── dev-server.js
├── .npm-cache/
│
├── backend/
│   ├── server.js                     ← env → DB (best-effort) → listen
│   ├── config/database.js
│   ├── routes/
│   │   ├── index.js                  ← mounts /products, /auth, /users, /cart, /wishlist, /orders, /payments, /reviews, /admin
│   │   ├── productRoutes.js
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── cartRoutes.js
│   │   ├── wishlistRoutes.js
│   │   ├── orderRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── reviewRoutes.js
│   │   ├── adminRoutes.js
│   │   └── aiRoutes.js              ← Phase 12: POST /api/ai/chat (JWT-protected)
│   ├── controllers/
│   │   ├── productController.js
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── cartController.js
│   │   ├── wishlistController.js
│   │   ├── orderController.js
│   │   ├── addressController.js
│   │   ├── paymentController.js
│   │   ├── reviewController.js
│   │   ├── adminController.js
│   │   └── aiController.js          ← Phase 12: OpenRouter function-calling engine
│   ├── models/
│   │   ├── Product.js
│   │   ├── User.js
│   │   ├── Cart.js
│   │   ├── Wishlist.js
│   │   ├── Order.js
│   │   └── Review.js
│   ├── middleware/
│   │   ├── cors.js
│   │   ├── errorHandler.js
│   │   └── authMiddleware.js         ← protect + requireAdmin + optionalAuth
│   ├── utils/
│   │   ├── asyncHandler.js
│   │   ├── jwt.js
│   │   ├── orderConfig.js
│   │   ├── rateLimiter.js
│   │   ├── authSelfTest.js
│   │   ├── paymentSelfTest.js
│   │   ├── seedProducts.js
│   │   └── promoteAdmin.js
│   ├── scripts/
│   │   ├── syncIndexes.js
│   │   ├── e2eReviews.js
│   │   ├── e2eSearchRelated.js
│   │   ├── e2eSecurity.js
│   │   ├── e2eAdminBoot.js
│   │   ├── e2eCustomerOrder.js
│   │   ├── genAdminShells.js
│   │   └── fixEncoding.js
│   ├── .env                          ← gitignored (PORT, NODE_ENV, CLIENT_ORIGIN, JWT_SECRET, MONGODB_URI, RAZORPAY_*)
│   ├── .env.example
│   ├── package.json
│   └── SECURITY_AUDIT.md (copy)
│
└── frontend/
    ├── index.html
    ├── pages/
    │   ├── products.html
    │   ├── product-details.html
    │   ├── cart.html
    │   ├── checkout.html
    │   ├── orders.html
    │   ├── order-details.html
    │   ├── login.html
    │   └── register.html
    ├── admin/
    │   ├── index.html
    │   ├── products.html
    │   ├── inventory.html
    │   ├── orders.html
    │   ├── users.html
    │   ├── reviews.html
    │   ├── css/admin.css
    │   └── js/
    │       ├── admin-core.js
    │       └── admin.js
    ├── css/
    │   ├── style.css
    │   ├── navbar.css
    │   ├── products.css
    │   ├── responsive.css
    │   └── chat.css                  ← Phase 12: glassmorphic chat widget styles
    ├── js/
    │   ├── app.js                    ← auth state, server mirrors, popovers, search suggestions
    │   ├── products.js               ← catalog (server filters, URL state, skeletons) + details (reviews, related)
    │   ├── cart.js                   ← cart page (qty/remove/clear, guest login CTA)
    │   ├── checkout.js               ← address book, COD/Razorpay, place order, retry
    │   ├── orders.js                 ← history list + detail, cancel, pay-now retry
    │   └── chat.js                   ← Phase 12: AI Personal Shopper widget (floating chat)
    └── assets/                       ← images (product placeholders, logo)
```

---

## Key Features

### Storefront
- Product catalog with **server-side** search, multi-category filter, price range, rating (≥N★), in-stock, on-sale, sort (newest, price, rating, featured, discount)
- URL-state sync (refresh/share preserves filters), skeleton loading, error/retry, rich no-results UX
- Product details: image gallery, qty stepper, add-to-cart toast with **View Cart** action, wishlist heart
- **Reviews & Ratings**: summary + distribution bars, verified-purchase chips, star-picker form, edit/delete own review, load-more pagination, moderation-aware (pending visible to owner)
- Related products (same category → same brand, ≤8)
- Header live-search suggestions (debounced, click-through)

### Authentication & User
- JWT Bearer tokens (7d expiry), bcrypt cost 10, tokens in localStorage (`novamart_auth_v1`)
- Register / Login / Me / Profile (whitelisted name/phone/avatar)
- Anti-enumeration login, deactivated account handling, role enum (user|admin)
- Protected routes via `protect` middleware; admin gates via `requireAdmin`

### Cart & Wishlist
- One cart/wishlist per user (unique indexes), server-backed, auto-prune deleted products
- Stock guards: requested ≤ stock on add/update, merge-on-readd, server-computed totals
- Guest clicks → login prompt with `?next=` return

### Checkout & Orders
- Address book (CRUD, single-default rule, phone/postal validation)
- COD + Razorpay online; **server-authoritative amounts** (client totals ignored)
- Transactional order creation: atomic stock decrement with guarded `{stock:{$gte:qty}}` + `$inc`
- History (paginated), detail, cancel (pending/confirmed only → stock restore)
- Pay-Now retry for unpaid Razorpay orders

### Payments (Razorpay)
- Create → server amount from `order.total` (paise) → Razorpay order ID
- Verify → backend recomputes HMAC-SHA256 with `timingSafeEqual` → `paid` + `paidAt`
- Webhook: raw-body HMAC vs `RAZORPAY_WEBHOOK_SECRET`, idempotent `payment.captured`
- Sandbox round-trip verified live

### Reviews & Moderation
- One review per user/product (unique compound index)
- Rating 1–5 integer, verified-purchase computed server-side from orders
- **Moderation on by default**: new/edited reviews start `isApproved:false`
- Public reads + aggregates count **approved only**; owner sees own pending via `myReview`
- Admin Reviews page: pending/approved/all filters, approve/hide/delete, pagination

### Admin Dashboard
- Dashboard metrics: users, products, orders, revenue (non-cancelled), low/out-of-stock
- Product CRUD (create/edit/deactivate/soft-delete)
- Inventory: stock-sorted + computed status chips (ok/low/out)
- Users: safe-field list + detail (order count, lifetime value), activate/deactivate (not self)
- Orders: all orders + detail, status transitions via map, cancel restores stock
- Reviews: pending/approved/all, approve/hide/delete, pagination

### Security (Phase 11)
- **Rate limiting** (in-memory fixed-window): login 30/15min, register 10/15min, payments 60/15min, reviews 20/15min, webhook 300/15min
- **Helmet** security headers (nosniff, frame-options, HSTS, referrer-policy; CSP off for JSON API)
- **Error hygiene**: production 5xx → generic message; dev keeps details
- **Admin list** no longer exposes address books
- **Mass-assignment protection**: product create/update strip `rating`, `numReviews`, `_id`, `__v`
- **Ownership everywhere**: foreign access → uniform 404 (no existence leak)
- **CORS**: explicit allowlist (localhost:5500, 127.0.0.1:5500 + `CLIENT_ORIGIN`)
- **Body limit**: 100kb → 413
- **Frontend XSS sweep**: all dynamic `innerHTML` escaped
- **npm audit**: 0 vulnerabilities

### AI Personal Shopper (Phase 12)
- **Floating chat widget** on every page (purple gradient button, glassmorphic window)
- **OpenRouter integration** with function calling (default model: `nvidia/nemotron-3.5-lightning:free`)
- **Three tools** the AI can invoke:
  - `search_catalog` — queries real MongoDB products (name/description/brand/category + maxPrice)
  - `add_to_cart` — securely writes to user's server cart with stock validation
  - `go_to_checkout` — signals frontend to redirect to checkout page
- **System prompt** constrains AI to product-only discussions, no invented prices
- **JWT-protected** endpoint (`POST /api/ai/chat`) — only logged-in users can chat
- **Session history** persisted in `sessionStorage` (survives page reloads)
- **Auto cart refresh**: detects "cart" mentions in AI reply → refreshes navbar badge
- **Auto redirect**: checkout intent → navigates to `/pages/checkout.html` after 1.5s delay
- **XSS-safe**: all messages escaped before DOM insertion
- **Error handling**: auth expiry → re-login prompt; network failure → friendly fallback
- **Zero HTML edits required**: 8 lines in `app.js` dynamically inject CSS/JS on every page

---

## Getting Started

### Backend
```bash
cd backend
npm install --cache ../.npm-cache --no-audit --no-fund
# Create .env from .env.example and fill:
#   PORT=5000
#   NODE_ENV=development
#   CLIENT_ORIGIN=http://127.0.0.1:5500
#   JWT_SECRET=<random 32+ chars>
#   MONGODB_URI=mongodb+srv://...
#   RAZORPAY_KEY_ID=<test key>
#   RAZORPAY_KEY_SECRET=<test secret>
#   RAZORPAY_WEBHOOK_SECRET=<dev secret>
#   OPENROUTER_API_KEY=<your openrouter key>      # Phase 12: AI Personal Shopper
#   OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free   # or any OpenRouter model
npm start          # or: npm run dev (auto-restart)
```

Seed products (run once):
```bash
node utils/seedProducts.js          # seeds only if collection empty
node utils/seedProducts.js --reset  # wipe & reseed
```

Create admin user:
```bash
node scripts/promoteAdmin.js admin@yourdomain.com
```

API health check: `GET http://localhost:5000/api/health`

### Frontend
Serve the `frontend/` folder with any static server (the included `dev-server.js` works for development):
```bash
# From repo root
node dev-server.js   # serves on http://127.0.0.1:5500
```

Or open `frontend/index.html` directly (CORS will fail for API calls without the dev server).

---

## Testing

All tests run **live** against the API + MongoDB Atlas:

```bash
cd backend/scripts

# Core feature suites
node e2eReviews.js           # 31 assertions — reviews CRUD, moderation, aggregates
node e2eSearchRelated.js     # 26 assertions — search, filters, sort, related products
node e2eAdminBoot.js         # admin login → dashboard renders
node e2eCustomerOrder.js     # register → cart → address → COD order → My Orders

# Security suite (51 assertions)
node e2eSecurity.js

# Self-tests (offline)
node utils/authSelfTest.js
node utils/paymentSelfTest.js

# Frontend smoke (headless DOM)
node uiSmokeTest.js js/app.js js/products.js
node uiSmokeTest.js js/app.js js/cart.js --cfg=cfg-cart.js
node uiSmokeTest.js admin/js/admin-core.js admin/js/admin.js --cfg=cfg-admin.js
```

---

## Known Constraints & Trade-offs

| Area | Decision |
|------|----------|
| Auth storage | JWT in `localStorage` (documented); HttpOnly cookies deferred |
| Razorpay | TEST keys used; rotate before production |
| Rate limiter | In-memory (single instance); swap to Redis for horizontal scale |
| CSP | Disabled on JSON API; enable when frontend has a production host |
| Dev server | `dev-server.js` is development-only; use proper static host/CDN + reverse proxy in prod |
| AI Chat | OpenRouter API (free tier compatible); requires valid `OPENROUTER_API_KEY` |
| AI Chat | Rate limiting not yet applied to `/api/ai/chat` (consider for Phase 13 hardening) |

---

## Contribution Rules

1. **Read `agent_memory.md` first** — it is the single source of truth.
2. One task at a time. Do not refactor, rename, move, or delete files without permission.
3. Do not install new packages without approval.
4. After every phase, update `agent_memory.md` and this `README.md`.
5. All server-side money calculations are authoritative — never trust client totals.
6. Never hard-code secrets; `.env` is gitignored.

---

## License

MIT (demo/educational project)
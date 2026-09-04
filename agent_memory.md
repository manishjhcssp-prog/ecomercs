# Agent Memory

## Project
E-commerce Website ("NovaMart" — demo storefront name)

## Current Phase
Phase 11 — Security Hardening & Production Audit (COMPLETE)

## Audit Status
PASS WITH WARNINGS — 0 critical / 0 high; 3 medium + 2 low found and FIXED.
Remaining items are INFO-level notes. Full report: SECURITY_AUDIT.md.

## Admin API
```
GET  /api/admin/meta                      → lowStockThreshold, orderStatuses,
                                            statusTransitions map, productCategories
GET  /api/admin/dashboard                 → all metrics computed in DB (see Dashboard Metrics)
GET  /api/admin/products?search&category&status&page&limit   (includes inactive)
POST /api/admin/products                  → delegates to productController.createProduct
GET/PUT/DELETE /api/admin/products/:id    → update/delete delegate to existing controller
                                            (delete = soft: isActive:false)
GET  /api/admin/inventory?page&limit      → stock-sorted items + server-computed
                                            status ok|low|out from LOW_STOCK_THRESHOLD
PUT  /api/admin/inventory/:id/stock       → {stock} whole number ≥ 0 only
GET  /api/admin/users?search&page&limit   → SAFE fields only (never password material)
GET  /api/admin/users/:id                 → safe detail + orderCount + lifetimeValue
PUT  /api/admin/users/:id                 → WHITELISTED to {isActive:boolean} ONLY;
                                            self-deactivation → 400; role changes not exposed
GET  /api/admin/orders?status&page&limit  → every user's orders w/ customer info
GET  /api/admin/orders/:id                → full detail of any order (support view)
PUT  /api/admin/orders/:id/status         → transition-map enforced; cancel restores
                                            stock transactionally; totals/prices/payment
                                            verification NEVER editable; no "mark as paid"
ALL routes sit behind router.use(protect, requireAdmin) — backend-enforced.
Public product WRITES (/api/products POST/PUT/DELETE) now also require admin
(the long-parked hardening decision, enacted here). Public READS stay open.

## Admin Permissions
- Admin can: view dashboard stats · full product CRUD incl. deactivate/soft-delete ·
  adjust any stock · list/search/inspect users · activate/deactivate accounts (not self) ·
  view ALL orders + details · move orders through ALLOWED transitions · cancel
  pending/confirmed orders (stock restored).
- Admin CANNOT: edit totals/historical prices · mark payments paid (view-only;
  paid comes only from verified gateway data) · change roles via API · deactivate self ·
  touch arbitrary user fields.

## Dashboard Metrics
totalUsers · totalProducts (+activeProducts) · totalOrders · pendingOrders
(pending+confirmed) · processingOrders · shippedOrders · completedOrders(delivered) ·
cancelledOrders · totalRevenue (Σ totals of NON-cancelled orders — documented rule) ·
lowStockThreshold(5, env-tunable ADMIN_LOW_STOCK_THRESHOLD) · lowStockCount ·
outOfStockCount · lowStockProducts[] (≤ threshold, newest-relevant 20).

## Admin UI Structure (adapts to the vanilla-JS storefront)
frontend/admin/{index,products,inventory,orders,users}.html + css/admin.css +
js/admin-core.js (shell/gate/helpers) + js/admin.js (page controllers dispatched by
body[data-page]). Sidebar on desktop → burger drawer ≤720px; tables scroll inside the
page instead of breaking layout. Session gate reuses the SAME JWT/localStorage key and
/api/auth/login — an inline login panel is just a second login SURFACE for admins, not a
second mechanism. Client-side role checks are UX only; the server enforces everything.

## Project Goal
A functional e-commerce website where visitors can browse products, view product
details, register/login, manage a shopping cart, check out, and place orders,
plus an admin area for managing products and orders.

## Technology Stack
- Frontend: HTML, CSS, JavaScript (vanilla, no framework, no build step)
- Backend: Node.js + Express.js (express@4.22.2)
- Database: MongoDB Atlas (M0) + Mongoose ODM (mongoose@8.24.4); URI CONFIGURED in
  backend/.env (gitignored). NOTE: the dev-PC TLS outage that blocked live runs
  RECOVERED on 2026-08-24 — Atlas connects normally again.
- Authentication: JWT (jsonwebtoken@9.x) + bcryptjs@3.x password hashing — INSTALLED
- Payments: razorpay official Node SDK (Phase 8)
- Package manager: npm 12 · Node >=20.12

## Completed Work
- PHASE 1 ✅ foundation · PHASE 2 ✅ storefront UI · PHASE 3 ✅ backend foundation ·
  PHASE 4 ✅ product system · PHASE 5 ✅ authentication · PHASE 6 ✅ cart & wishlist.
- PHASE 7 COMPLETED — Checkout & Order System:
  - `utils/orderConfig.js` — BACKEND-AUTHORITATIVE business rules: shippingFee ₹49 /
    free ≥ ₹999, tax 5% flat GST-style, discount 0 (no coupons yet), INR.
  - `models/Order.js` — purchase-time SNAPSHOT record: items[] carry {product ref,
    name, image, price, quantity} copied at creation; shippingAddress embedded as a
    plain copy; money fields server-computed; strict enums orderStatus
    (pending|confirmed|processing|shipped|delivered|cancelled), paymentStatus
    (pending|paid|failed|refunded), paymentMethod (cod only for now); human-friendly
    orderNumber (NM-XXXXXX-XXXX); itemCount virtual.
  - Address API on the EXISTING User.addresses subdocs (`protect` + owner-scoped):
    GET/POST /api/users/addresses · PUT/DELETE /api/users/addresses/:addressId.
    Single-default rule enforced (new default clears old; first address auto-default;
    deleting default promotes oldest). Schema gained phone/postal patterns — market-
    flexible (+91 spaced, plain 10-digit, US zips OK) but garbage rejected.
  - POST /api/orders {addressId, paymentMethod?='cod'}: loads the DATABASE cart,
    validates every product (exists+active) and stock (requested ≤ available → 409),
    computes ALL money server-side (client totals ignored), then runs ONE MongoDB
    TRANSACTION: insert Order → per-item GUARDED decrement ({stock:{$gte:qty}} +
    $inc −qty; modifiedCount≠1 ⇒ concurrent oversell ⇒ abort everything) → clear
    cart. Any failure rolls back all three steps. NOTE: transaction support must be
    VERIFIED live once TLS recovers (Atlas M0 is a replica set → expected to work;
    if it does not, directive §27 says STOP and report).
  - GET /api/orders (?page&limit≤50) — owner-scoped history, newest first, summary
    fields + pagination block. GET /api/orders/:id — full details, foreign/missing ids
    get the SAME uniform 404 (no probing). POST /api/orders/:id/cancel — allowed ONLY
    while pending|confirmed (config constant); restores stock inside a transaction;
    already-cancelled → 400; sets paymentStatus failed when it was pending.
  - FRONTEND: new pages checkout.html / orders.html / order-details.html (same shell,
    page-scoped styles only in checkout.html) + js/checkout.js (address book UI with
    select/add/edit/delete/default, server-cart items, display summary with "server
    recalculates" note, COD radio, Place Order → confirmation state showing order id/
    total/status/address/items + links) and js/orders.js (paginated history list +
    detail view with cancel button gated by status). app.js account popover gained a
    My Orders link; cart.js Proceed-to-Checkout now navigates to checkout.html.
    Guests are redirected to login with ?next= honored everywhere.
- PHASE 6 (retained detail) — Shopping Cart & Wishlist:
  - `models/Cart.js`: ONE cart per user (unique index on user); items[] =
    {product: ref→Product, quantity} with integer/≥1/≤999 validation. Product data is
    NEVER duplicated — reads populate live name/price/images/stock.
  - `models/Wishlist.js`: one per user (unique index); products[] of refs only.
  - Cart API (all behind `protect`, all scoped to req.user._id):
    GET /api/cart (populated + totals {itemCount, subtotal}, auto-prunes lines whose
    product was deleted/soft-deleted) · POST /api/cart/items (exists?active?in-stock?
    merge-or-add; combined qty ≤ stock; out-of-stock → clear error) ·
    PUT /api/cart/items/:productId (exact quantity ≥1, ≤ stock, 404 if not in cart) ·
    DELETE /api/cart/items/:productId (single line) · DELETE /api/cart (clear only).
  - Wishlist API: GET /api/wishlist (populated + pruned) · POST /api/wishlist/:productId
    (dup → friendly no-op "Already in wishlist.") · DELETE /api/wishlist/:productId
    (absent → 404) · DELETE /api/wishlist (clear).
  - Stock handling per spec: requested ≤ stock enforced on add AND update; stock is
    never decremented here (reservation belongs to checkout/orders later).
  - Totals computed SERVER-side ({itemCount, subtotal}); frontend delivery/discount
    display is cosmetic until Phase-7 checkout recalculates authoritatively.
  - FRONTEND rewired from localStorage snapshots to the API (MongoDB = source of truth):
    cart page renders server data with qty ± / remove / clear wired to PUT/DELETEs and
    re-renders from fresh responses; wishlist popover lists server items with Add-to-cart
    + remove; hearts/badges sync from server state after load; guests clicking cart or
    heart get "Please log in to continue." and are redirected to login with ?next=
    honored after sign-in; old novamart_cart_v2/wishlist_v2 snapshot systems RETIRED
    (no dual systems). No design/markup changes.
- PHASE 5 (retained detail) — Authentication & User System:
  - `models/User.js`: name/email(unique, lowercase)/password(bcrypt, select:false)/
    phone/avatar/addresses[] (checkout-ready subdocs: fullName, phone, addressLine1/2,
    city, state, postalCode, country, isDefault)/role enum(user|admin, default user)/
    isActive + timestamps. pre-save hook hashes password on create/change;
    comparePassword method; toJSON strips password/__v and exposes id.
  - POST /api/auth/register: explicit {name,email,password} whitelist — client-sent
    role/isActive are structurally ignored; duplicate email → 409; returns user+token.
  - POST /api/auth/login: uniform "Invalid email or password." for unknown-email AND
    wrong-password (anti-enumeration); deactivated account → 403 distinct message.
  - GET /api/auth/me (protect): safe profile of token owner.
  - GET/PUT /api/users/profile (protect): whitelist name/phone/avatar only — email,
    password and role are immutable through this endpoint.
  - middleware/authMiddleware.js: protect (Bearer parse → verify → load CURRENT user
    from DB → attach req.user; 401 missing/malformed/invalid/expired/gone, 403 inactive,
    503 misconfig) + requireAdmin (403 gate, ready for admin phase).
  - utils/jwt.js: sign/verify strictly from env JWT_SECRET (no secret → loud 503);
    JWT_EXPIRES_IN default 7d.
  - Frontend connected without redesign: login/register forms now hit the real API
    (data-auth-form="login|register" replaces demo-submit), store {token,user} in
    localStorage (novamart_auth_v1) and redirect home with a welcome toast.
  - Navbar account state (JS-injected, zero HTML changes): when logged in the account
    icon becomes a popover toggle showing name/email/role + Log out; logged out it is
    the normal login link again.
  - utils/authSelfTest.js: offline harness proving bcrypt hash/verify + wrong-pw
    rejection + no plaintext leakage, JWT sign/verify round-trip, tamper rejection,
    expiry rejection.

## Current Task
None — Phase 11 (security audit & hardening) complete. Awaiting user instruction.

## Next Task
Phase 12 — SEO, Performance & Production Optimization.

## Review API (Phase 10)
```
GET    /api/products/:productId/reviews   PUBLIC (optionalAuth personalizes)
                                          ?page&limit≤50&sort=recent|rating_desc|
                                          rating_asc|helpful_high&q=<in-review search>
                                          → {reviews:[{id,user:{name},rating,title,comment,
                                            verifiedPurchase,createdAt,…}], pagination,
                                            distribution:[{rating,count}] (approved only),
                                            summary:{average,count} (= Product.rating/numReviews),
                                            myReview (requester's own incl. pending, auth only)}
POST   /api/products/:productId/reviews   Bearer · {rating:int1..5, title?≤100, comment 3..1000}
                                          → 201 PENDING (isApproved:false) · verifiedPurchase
                                          computed server-side from Orders · duplicate → 409
PUT    /api/reviews/:reviewId             Bearer OWNER ONLY (403 others) · edits re-enter
                                          moderation · aggregates recomputed
DELETE /api/reviews/:reviewId             Bearer OWNER ONLY · aggregates recomputed
GET    /api/admin/reviews                 Admin · ?status=pending|approved|all&q&product&page&limit
PUT    /api/admin/reviews/:id/status      Admin · {isApproved:boolean} approve/hide
DELETE /api/admin/reviews/:id             Admin · hard delete
```

## Review Rules (Phase 10 — decisions recorded)
- Rating = whole integer 1..5 enforced by schema validator (0/6/-1/10/4.5 structurally impossible).
- ONE review per user per product via UNIQUE compound index {user,product} — DB-level guarantee;
  controller also pre-checks for a friendly 409 ("edit your existing review instead").
- VERIFIED PURCHASE: Order.exists({user, 'items.product': productId, orderStatus ≠ 'cancelled'})
  — computed ONLY server-side at create time; client input can never set it.
- MODERATION ON by default: every create/edit starts isApproved:false; public reads +
  rating aggregates count APPROVED reviews only; owner always sees own pending review via
  myReview; admins approve/hide/delete from the admin Reviews page.
- Product.rating/numReviews (legacy Phase-4 fields) are now MAINTAINED DENORMALIZED
  SUMMARY of approved reviews (avg rounded to 1 decimal) — recomputed after every mutation;
  sorting by 'rating' therefore reflects real data.
- Popularity sort NOT implemented: no sold-count metric exists in the data model
  (directive §16 forbids inventing fake metrics). Recorded for a future phase.

## Search / Filter / Sort API (Phase 10 state)
```
GET /api/products
  search     name/description/brand/category · case-insensitive regex · input escaped,
             trimmed, capped at 100 chars · whitespace-only ignored
  category   exact, case-insensitive, comma-separated multi-select (≤10 values)
  minPrice/maxPrice  validated numbers ≥0 (either or both)
  rating     whole 1..5 → stored average ≥ N ("4★ & up"); non-integers → 400
  inStock    '1'/'true' → stock > 0 only
  sale       '1'/'true' → originalPrice > price only ($expr)
  sort       newest | price_asc | price_desc | rating | featured (+client 'discount')
  page/limit page ≥1 · limit 1..50 (default 12)
GET /api/products/:id/related → same active category first (rating desc, then newest),
  topped up with same-brand matches; excludes self/inactive; limit 8; card fields only.
Indexes added: reviews {user,product} unique · {product,isApproved,createdAt:-1} (listing)
· {isApproved,createdAt} (moderation queue). Deliberately NO product-text index:
contains-style regex cannot use it at this catalog size; revisit if catalog grows.
```

## Payment Provider
Razorpay — user-selected 2026-08-24. TEST keys CONFIGURED in backend/.env the same day
(user-provided; values NEVER recorded here). RAZORPAY_WEBHOOK_SECRET currently holds a
dev-only value for local HMAC tests — replace with the dashboard-configured secret
before expecting REAL webhook deliveries to verify. Live sandbox verification: gateway
order creation WORKS (see Testing Phase 8 results).

## Payment API
```
POST /api/payments/create   {orderId} (Bearer) → {keyId(PUBLIC), razorpayOrderId,
                            amount(paise), currency} · amount ALWAYS from order.total
                            · 409 already-paid/cancelled · 503 keys missing
POST /api/payments/verify   {razorpay_order_id, razorpay_payment_id, razorpay_signature}
                            (Bearer) → backend recomputes HMAC-SHA256(order|payment,
                            KEY_SECRET) with timingSafeEqual → only genuine match sets
                            paymentStatus=paid + paidAt (+pending→confirmed) · idempotent
                            on re-verify · 400 signature mismatch · 404 no matching order
POST /api/payments/webhook  PUBLIC by design; authenticity = HMAC of RAW body vs
                            RAZORPAY_WEBHOOK_SECRET (req.rawBody captured in server.js
                            express.json verify callback) · handles payment.captured ·
                            IDEMPOTENT (already-paid skipped) · 400 invalid signature ·
                            always 200 once signature valid
```
Payment flow: Place Order(paymentMethod=razorpay, status pending) → create → Razorpay
Checkout modal (official checkout.js loaded on demand) → handler posts verify →
backend verifies → PAID. Dismissal/failure leaves the order UNPAID and retryable via
[Pay Now] buttons (orders list + details) that REUSE the same order. COD unchanged.

## Order API
```
POST /api/orders                {addressId, paymentMethod?='cod'} → 201 order · 400 empty cart ·
                                404 address/product · 409 stock/unavailable · money server-computed
GET  /api/orders?page&limit     → owner history {orders:[summaries], pagination} (limit ≤ 50)
GET  /api/orders/:id            → full details · uniform 404 for foreign/missing ids
POST /api/orders/:id/cancel     → only while pending|confirmed · restores stock in transaction
All require Bearer auth.
```

## Address API
```
GET    /api/users/addresses                 → owner's addresses
POST   /api/users/addresses                 → create · single-default rule · first auto-default
PUT    /api/users/addresses/:addressId      → update fields or set default · 404 foreign/absent
DELETE /api/users/addresses/:addressId      → delete · promotes oldest if default removed
All require Bearer auth. Stored on the EXISTING User.addresses subdocuments.

## Cart API
```
GET    /api/cart                       → {items:[{product:{id,name,price,image,stock},quantity}], itemCount, subtotal}
POST   /api/cart/items                 {productId, quantity=1} → 201 updated cart · 400 stock/qty · 404 product
PUT    /api/cart/items/:productId      {quantity} → updated cart · 400 qty/stock · 404 not in cart
DELETE /api/cart/items/:productId      → updated cart · 404 if absent
DELETE /api/cart                       → empty cart (user untouched)
All require Bearer auth; everything scoped to req.user._id.
```

## Wishlist API
```
GET    /api/wishlist                    → {products:[{id,name,price,image,stock}]}
POST   /api/wishlist/:productId         → 201 added · 200 "Already in wishlist." · 404 product
DELETE /api/wishlist/:productId         → 200 removed list · 404 absent
DELETE /api/wishlist                    → cleared
All require Bearer auth. Duplicates impossible (controller-checked).

## Authentication Endpoints
```
POST /api/auth/register   {name,email,password} → 201 {user,token} · 400 validation · 409 duplicate
POST /api/auth/login      {email,password}      → 200 {user,token} · 401 invalid · 403 deactivated
GET  /api/auth/me         (Bearer)              → 200 safe profile · 401/403 per middleware
```

## User Endpoints
```
GET /api/users/profile    (Bearer) → 200 profile
PUT /api/users/profile    (Bearer) {name?,phone?,avatar?} → updated profile (whitelist only)
```

## Roles
- user (default for every registration — cannot be self-assigned to admin)
- admin (set server-side only; requireAdmin middleware ready for future admin routes)

## Authentication Strategy
- Stateless JWT in `Authorization: Bearer <token>` headers.
- Token storage (frontend): localStorage key `novamart_auth_v1` = {token, user}.
  Chosen over cookies because the API is a separate origin (:5000 vs :5500) and this
  avoids cookie/CORS credential complexity in dev; XSS risk accepted for the demo scope.
  If hardened later: move to httpOnly SameSite cookies behind same-origin proxy.
- Password hashing: bcryptjs, cost 10, via pre-save hook (plain text never persisted).
- JWT_SECRET lives ONLY in gitignored backend/.env (a random local dev secret was
  generated there). .env.example documents generation. Never commit real secrets.

## Backend Structure
```text
backend/
├── server.js                    ← env→DB(best-effort)→listen; warns if JWT_SECRET missing
├── config/database.js
├── routes/
│   ├── index.js                 ← mounts /products, /auth, /users, /cart, /wishlist under /api
│   ├── productRoutes.js
│   ├── authRoutes.js            ← register/login public · me protected
│   ├── userRoutes.js            ← all protected (router.use(protect))
│   ├── cartRoutes.js            ← all protected
│   └── wishlistRoutes.js        ← all protected
├── controllers/
│   ├── productController.js
│   ├── authController.js        ← whitelist registration · anti-enumeration login
│   ├── userController.js        ← profile GET/PUT (field whitelist)
│   ├── cartController.js        ← scoped CRUD + stock guards + server totals + pruning
│   └── wishlistController.js    ← scoped refs, dup-proof add, prune on read
├── models/
│   ├── Product.js
│   ├── User.js                  ← bcrypt hook · select:false password · safe toJSON
│   ├── Cart.js                  ← user unique · items[{product ref, quantity ≥1 int}]
│   └── Wishlist.js              ← user unique · products[refs]
├── middleware/
│   ├── cors.js
│   ├── errorHandler.js
│   └── authMiddleware.js        ← protect + requireAdmin
├── utils/
│   ├── asyncHandler.js · jwt.js · authSelfTest.js · seedProducts.js
├── .env                         ← PORT/NODE_ENV/CLIENT_ORIGIN/JWT_SECRET(dev)/JWT_EXPIRES_IN; MONGODB_URI EMPTY [gitignored]
└── package.json                 ← express, mongoose, bcryptjs, jsonwebtoken
```

## Project Structure (root)
```text
D:\cd\ECOMERCS
├── .gitignore · README.md · dev-server.js · .npm-cache/ · agent_memory.md
├── backend/                   ← see above
└── frontend/
    ├── index.html · pages/{products,product-details,cart,login,register}.html
    ├── css/{style,navbar,products,responsive}.css     (unchanged since Phase 2)
    ├── js/app.js       ← auth state + SERVER-BACKED cart/wishlist mirrors, popovers (P6)
    ├── js/products.js  ← catalog/details; hearts read server wishlist state
    └── js/cart.js      ← cart page renders GET /api/cart; mutations via API (P6)
```

## Important Decisions
- Phases: 1✅ 2✅ 3✅ 4✅ 5✅ 6✅ → 7 Checkout & Orders → 8 Orders/Admin → 9 Admin →
  10 Testing → 11 Deployment (numbering per directives; adjust as they arrive).
- Cart/wishlist require AUTHENTICATION everywhere (backend `protect` + frontend gating).
  Guests clicking cart/heart get a toast + redirect to login with ?next= honored after.
- MongoDB is the SINGLE source of truth for cart/wishlist. The old localStorage snapshot
  systems (novamart_cart_v2/_wishlist_v2) were RETIRED — app.js keeps only an in-memory
  mirror of the last server response for instant badges/popovers; every mutation is an
  API call; local state is never written back wholesale.
- Cart items store ONLY {product ref, quantity} — no duplicated product data; prices are
  populated live at read time so price changes reflect immediately and checkout will
  recalculate authoritatively (frontend totals are display-only until then).
- One cart + one wishlist per user via unique index on user; documents auto-created
  (upsert) on first access.
- GET endpoints self-heal: lines/refs whose product was deleted or soft-deleted are
  pruned from the DB during reads.
- Stock rules: add/update enforce requested ≤ stock; out-of-stock products rejected
  with clear messages; stock is NOT decremented by cart actions (checkout's job later).
- Wishlist duplicates impossible: controller checks membership before push; duplicate
  POST returns friendly no-op rather than error.
- Registration whitelist guard: schema enum would technically accept role:'admin', so the
  controller constructs users from explicit {name,email,password} ONLY — verified by test
  that role stays 'user' regardless of payload. Profile PUT has its own whitelist.
- Anti-enumeration: login returns identical 401 "Invalid email or password." for unknown
  email or wrong password; deactivated accounts get distinct 403 (needed by test matrix).
- protect loads the user fresh from DB each request — deleted/deactivated accounts lose
  access immediately even with unexpired tokens.
- DB still optional at startup: endpoints return clean JSON 503 until
  MONGODB_URI connects; protect/middleware 401s are DB-independent.
- ORDER RULES (Phase 7): clients submit only {addressId, paymentMethod?} — every
  money value is recomputed server-side from live products; order items + shipping
  address are SNAPSHOTS so history never changes; stock decrements use conditional
  atomic updates ({stock:{$gte:qty}} + $inc) inside the creation transaction;
  cart clears ONLY after successful commit; cancellation restores stock in a
  transaction and is limited to pending|confirmed; users can never set status or
  payment fields through any endpoint.
- Email verification & password reset deliberately NOT built; recorded as future work.
- npm installs MUST use --cache D:\cd\ECOMERCS\.npm-cache (sandbox blocks profile cache).
- Earlier decisions stand: soft-delete products, discount virtual, INR/en-IN,
  NovaMart branding, vanilla frontend with visible demo fallback.

## Order Status
- orderStatus: pending | confirmed | processing | shipped | delivered | cancelled
  (enum — arbitrary strings rejected). USER cancellation allowed ONLY while
  pending|confirmed (utils/orderConfig.js USER_CANCELLABLE_STATUSES); admin
  transitions arrive with the admin phase.
## Payment Status
- paymentStatus: pending | paid | failed | refunded (default pending).
  On user-cancel of a pending-payment order it flips to failed.
## Payment Method
- paymentMethod: 'cod' | 'razorpay'. Online = Razorpay Checkout only; the server
  never pretends a payment succeeded without a verified gateway signature.
- paymentProvider: '' | 'razorpay'; razorpayOrderId/razorpayPaymentId/paymentSignature/
  paidAt stored on orders after successful verification. NO card/bank data ever stored.

## Files Created (Phase 10)
- `backend/models/Review.js`
- `backend/controllers/reviewController.js`
- `backend/routes/reviewRoutes.js`
- `backend/scripts/syncIndexes.js` · `e2eReviews.js` · `e2eSearchRelated.js`
  (index maintenance + two live verification suites, 57 assertions total)
- `frontend/admin/reviews.html` (generated via genAdminShells.js)

## Files Modified (Phase 10)
- `backend/middleware/authMiddleware.js` — added optionalAuth (public endpoints that
  personalize when a valid Bearer is present).
- `backend/routes/productRoutes.js` — nested review GET/POST + /:id/related.
- `backend/routes/index.js` — mounted /reviews.
- `backend/routes/adminRoutes.js` — review moderation routes.
- `backend/controllers/productController.js` — server-side rating/inStock/sale filters,
  multi-category search incl. category field, input caps/validation, related-products
  handler, documented popularity decision.
- `backend/controllers/adminController.js` — list/setApproval/delete review handlers.
- `backend/models/Product.js` — no schema change; existing rating/numReviews now
  maintained as the real approved-review summary.
- `frontend/js/app.js` — toast upgraded (error variant + inline action link e.g. View
  Cart), storePage() path helper, header live-search suggestions (debounced, both nav
  forms), wired in boot.
- `frontend/js/products.js` — catalog moved to fully server-side filters (rating/
  inStock/sale/minPrice), URL-state sync via replaceState, skeleton loading, error+retry
  state, richer no-results empty state with reset; details page gained reviews section
  (summary, distribution bars, list w/ verified chips, own-review edit/delete, star
  picker form, load-more), related products section, rating-row anchor link.
- `frontend/pages/products.html` — price-range inputs (min+max), ★★2&up option, sort
  "Newest", offers label clarified.
- `frontend/admin/js/admin-core.js` — NAV + Reviews entry.
- `frontend/admin/js/admin.js` — runReviews moderation controller.
- `backend/scripts/genAdminShells.js` — reviews page added; admin assets v=20260910a.
- `frontend/css/style.css` — Phase-10 styles (suggestions, skeletons, distribution,
  review cards/chips/form, toast actions).
- Root+pages HTML — asset version stamps v=20260910a.

## Dependencies Added (Phase 10)
- None.

## Database Changes (Phase 10)
- NEW COLLECTION reviews (schema above).
- Indexes: reviews {user:1,product:1} UNIQUE (one-review-per-user);
  {product:1,isApproved:1,createdAt:-1} (public listing); {isApproved:1,createdAt:1}
  (admin queue). Synced live via scripts/syncIndexes.js and VERIFIED present in Atlas.
- Product.rating/numReviews semantics changed from unused to authoritative denormalized
  summary of approved reviews (recomputed server-side after every review mutation).

## Testing (Phase 10 results)
ALL LIVE against running API + Atlas:
- e2eReviews.js — 31/31 ✅: create (verified vs non-buyer), duplicate →409, ratings
  0/6/-1/10 →400, empty & <3-char comment →400, missing product →404, unauthenticated
  →401, pending invisible publicly (+owner sees via myReview), approve updates aggregates
  (avg math exact), distribution counts correct, server-side rating filter boundary
  (4.5 matches ≥4 but not ≥5), cross-user edit/delete →403, edit re-enters moderation &
  drops from aggregates, re-approve recomputes, owner delete + admin delete recount, 404s.
- e2eSearchRelated.js — 26/26 ✅: partial/case-insensitive search, category-in-search,
  no-results, special chars safe, 300-char capped, whitespace ignored, price band,
  inStock, invalid filter values →400, price_asc monotonic, newest order, combined
  query + pagination echo + intra-set ordering, related excludes self/inactive/deleted,
  same-category-or-brand rule, limit ≤8, restore-via-PUT works, missing product →404.
- Regression: e2eAdminBoot ✅ · e2eCustomerOrder ✅ · uiSmokeTest pairs all pass
  (storefront ×4, cart/checkout scenarios, admin boot + login flow).
- User-facing flows verified by code-path inspection + harness; interactive browser
  walkthrough left to the user (self-diagnosing pages will surface anything).

## Known Problems
## Files Created (Phase 9)
- `backend/controllers/adminController.js` (15 handlers: meta, dashboard, products
  list + delegated writes, inventory, users, orders, status transitions)
- `backend/routes/adminRoutes.js` (router.use(protect, requireAdmin) gate)
- `backend/utils/adminConfig.js` (LOW_STOCK_THRESHOLD=5 via ADMIN_LOW_STOCK_THRESHOLD,
  ADMIN_STATUS_TRANSITIONS map — single source of truth)
- `backend/scripts/promoteAdmin.js` (dev-only create/promote admin; uses native
  process.loadEnvFile like server.js; NO public endpoint can mint admins)
- `frontend/admin/index.html|products.html|inventory.html|orders.html|users.html`
- `frontend/admin/css/admin.css`
- `frontend/admin/js/admin-core.js` · `frontend/admin/js/admin.js`

## Files Modified (Phase 9)
- `backend/routes/productRoutes.js` — public product WRITES now protected with
  protect+requireAdmin (reads stay public).
- `backend/routes/index.js` — mounted /admin.
- `frontend/js/products.js` — wrapped in IIFE (post-phase hotfix): killed global
  `API_BASE` collision with app.js that blanked every storefront page in real browsers.
- `backend/scripts/uiSmokeTest.js` — NEW dev tool (see Known Problems).
- `agent_memory.md` — this update.

## Dependencies Added (Phase 9)
- None.

## Files Created (Phase 8)
- `backend/controllers/paymentController.js` (createPayment / verifyPayment / webhook
  + timing-safe signature internals exported for self-tests)
- `backend/routes/paymentRoutes.js`
- `backend/utils/paymentSelfTest.js` (offline HMAC/tamper/paise tests)

## Files Modified (Phase 8)
- `backend/models/Order.js` — added paymentProvider, razorpayOrderId (indexed),
  razorpayPaymentId, paymentSignature, paidAt.
- `backend/utils/orderConfig.js` — PAYMENT_METHODS now ['cod','razorpay'].
- `backend/routes/index.js` — mounted /payments. (NOTE: a bad write briefly clobbered
  this file during the phase; fully restored and verified — health + all routers OK.)
- `backend/server.js` — express.json gained verify callback capturing req.rawBody for
  webhook signature verification.
- `backend/.env` + `.env.example` — empty RAZORPAY_* placeholders added (user fills .env).
- `frontend/js/app.js` — payWithRazorpay(orderId) shared flow: POST create → load
  checkout.js on demand → open modal → handler posts verify → resolves only on
  BACKEND-verified success; modal dismiss/failure reject with friendly messages.
- `frontend/js/checkout.js` — Payment section offers COD + online; placeOrder creates
  the order then pays online; paid confirmation vs "order saved — payment incomplete,
  retry from My Orders" state.
- `frontend/js/orders.js` — [Pay Now] retry buttons on unpaid non-cancelled razorpay
  orders (list + details), status lines update after verification.

## Dependencies Added (Phase 8)
- razorpay (official Node SDK, installed with workspace npm cache).

## Files Created (Phase 7)
- `backend/models/Order.js`
- `backend/controllers/addressController.js`
- `backend/controllers/orderController.js`
- `backend/routes/orderRoutes.js`
- `backend/utils/orderConfig.js`
- `frontend/pages/checkout.html` · `frontend/pages/orders.html` · `frontend/pages/order-details.html`
- `frontend/js/checkout.js` · `frontend/js/orders.js`

## Files Created (Phase 6)
- `backend/models/Cart.js`
- `backend/models/Wishlist.js`
- `backend/controllers/cartController.js`
- `backend/controllers/wishlistController.js`
- `backend/routes/cartRoutes.js`
- `backend/routes/wishlistRoutes.js`

## Files Modified (Phase 7)
- `backend/routes/index.js` — mounted /orders.
- `backend/routes/userRoutes.js` — added address CRUD routes (owner-scoped, protected).
- `backend/models/User.js` — addressSchema gained phone/postalCode match patterns
  (market-flexible: +91 spaced / plain 10-digit / US zips valid; garbage rejected).
- `frontend/js/app.js` — account popover now includes a My Orders link.
- `frontend/js/cart.js` — Proceed to Checkout navigates to checkout.html.
- `agent_memory.md` — this update.

## Dependencies Added (Phase 7)
- None.

## Files Modified (Phase 6)
- `backend/routes/index.js` — mounted /cart and /wishlist routers.
- `frontend/js/app.js` — REWRITTEN core: removed snapshot/localStorage cart+wishlist
  systems and productMeta registry; added server mirrors (applyCartData/
  applyWishlistData), API mutations (addToCart/setCartQty/removeFromCart/
  clearServerCart/toggleWishlist), refreshServerState on boot+login, guest
  promptLogin with ?next=, heart/badge sync, popover renders server data with
  Add-to-cart buttons.
- `frontend/js/cart.js` — REWRITTEN: renders GET /api/cart (#cart-root/#cart-summary
  contract kept); qty ± / remove / clear wired to PUT/DELETE with busy-guard and
  error resync; guest state with login CTA; delivery display marked indicative.
- `frontend/js/products.js` — dropped registerProductMeta calls; inWishlist→
  isWishlisted; details Buy Now awaits successful add before redirecting.
- `agent_memory.md` — this update.

## Dependencies Added (Phase 6)
- None.

## Files Created (Phase 5)
- `backend/models/User.js`
- `backend/controllers/authController.js`
- `backend/controllers/userController.js`
- `backend/middleware/authMiddleware.js`
- `backend/routes/authRoutes.js`
- `backend/routes/userRoutes.js`
- `backend/utils/jwt.js`
- `backend/utils/authSelfTest.js`

## Files Modified (Phase 5)
- `backend/routes/index.js` — mounted /auth and /users routers.
- `backend/server.js` — startup warning when JWT_SECRET missing (one line).
- `backend/.env` — added generated dev JWT_SECRET + JWT_EXPIRES_IN=7d (gitignored).
- `backend/.env.example` — documented JWT variables + generation command.
- `frontend/js/app.js` — Store.AUTH_KEY, api() helper (window.NOVA.API_BASE shared),
  getAuth/isLoggedIn/saveAuth/logout, refreshAccountUI popover injection,
  account/logout delegation branches, Escape/outside-close coverage, handleAuthForm.
- `frontend/js/products.js` — API_BASE now sourced from window.NOVA (centralized).
- `frontend/pages/login.html` — form wired (data-auth-form="login"), note text refreshed.
- `frontend/pages/register.html` — form wired (data-auth-form="register").
- `agent_memory.md` — this update.

## Dependencies Added (Phase 5)
- bcryptjs (v3.x) — password hashing (pure JS, no native build issues).
- jsonwebtoken (v9.x) — JWT signing/verification.
- Nothing else.

## Database Status
CREDENTIALS VERIFIED WORKING — Atlas (user manishjhcssp_db_user @ cluster0, db
`ecommerce`) connected successfully after the user reset the DB-user password;
"bad auth" resolved. FULL LIVE TEST MATRIX PASSED (see Testing — Phase 5 live).
CURRENT BLOCKER: machine-wide outbound TLS outage on the dev PC since ~18:12 —
google/cloudflare/Atlas ALL fail TLS handshakes while plain HTTP works; both
Schannel and OpenSSL affected → environmental, NOT a project issue. Suspect a
Node-based VPN/proxy/security helper killed during zombie-process cleanup, or
AV HTTPS-scan state change. config/database.js now retries connect 5× (5s
apart; DB_CONNECT_ATTEMPTS/DB_CONNECT_RETRY_MS tunable) so transient blips
self-heal. RECOVERY: restore TLS (restart VPN/security software or reboot),
restart API (`node server.js` in backend/) — no code or config changes needed.
Test data in Atlas: 14 seeded products; users john@example.com /
securepassword (role user, profile updated) and sneaky@example.com.

## Testing (Phase 5 results)
Passed offline/live:
- node --check: all touched backend files + 3 frontend JS files.
- authSelfTest: bcrypt round-trip, wrong-pw rejection, plaintext never in hash, JWT
  sign/verify id round-trip, tampered-token rejection, expired-token TokenExpiredError.- Model checks: valid doc validates; email lowercased ("john@Example.com"→"john@example.com");
  invalid doc yields precise messages; forced role:'admin' neutralized by controller whitelist.
- Live API (server booted, DB down): register valid → 503 w/ setup guidance; login → 503;
  /auth/me missing token → 401 "missing Bearer"; malformed "Basic…" header → 401;
  garbage Bearer → 401 "Invalid authentication token."; /users/profile unauthenticated → 401;
  health unaffected; mangled-JSON request correctly produced 400 "Invalid JSON payload."
- Frontend audits: HTML refs ALL OK; getElementById targets OK (account-btn assigned
  dynamically via btn.id in refreshAccountUI — confirmed line 254 app.js); both forms carry
  data-auth-form attributes.
Passed LIVE with MongoDB connected (2026-08-23, before the TLS outage):
- Health: database "connected". Seed: 14 products inserted.
- Products: list 12/total 14/pages 2; page2&limit10 → 4; search "wireless" → 1 hit;
  category=electronics (lowercase) → 3 (case-insensitive); minPrice500/maxPrice2000 →
  8 all in range; sort price_asc → 499,599,649,749,799; sort featured limit8 → 8/8
  featured; invalid id → 400; unknown ObjectId → 404; POST create → 201 + discount
  virtual (25%); PUT rename/reprice applied; PUT negative price → 400 validator
  message; DELETE → soft-delete msg, isActive:false, subsequent GET → 404, list
  total back to 14; POST bad enum → 400 exact message.
- Auth: register John → 201 role user, NO password in response; duplicate → 409;
  weak pw → 400; bad email → 400; register payload WITH role:"admin" → still user
  (escalation blocked); login correct → token; wrong-pw vs unknown-email → IDENTICAL
  401 messages (anti-enumeration verified programmatically); missing fields → 400;
  /auth/me with token → safe profile; profile GET/PUT round-trip — PUT sneaking
  role/email updated only name/phone (role stayed user, email unchanged);
  tampered token → 401; hash at rest: $2b$10$, 60 chars, zero plaintext;
  deactivated user → login 403 AND old-token /me 403 (protect re-checks DB per
  request), reactivated after. Test users kept for browser testing.
- Frontend live: all pages HTTP 200 from :5500; CORS preflight OPTIONS → 204 with
  correct allow-origin/methods/headers for localhost:5500.

## Testing (Phase 6 results)
Passed OFFLINE (TLS outage still active — live DB runs pending):
- node --check: 7 new/edited backend files + 3 frontend JS files.
- Module graph loads (require('./server.js')).
- Model unit tests (validateSync): cart valid doc OK; quantity 0 → "at least 1";
  −5 → "at least 1"; 2.5 → "whole number"; missing product/user refs rejected;
  wishlist valid.
- Auth gating: ALL NINE new endpoints return 401 unauthenticated (protect fires
  before any DB access) — verified live against running server after route reload.
- Frontend audits: HTML src/href ALL OK; getElementById targets OK
  (account-btn = dynamic assignment, known false positive); zero leftover refs to
  removed snapshot functions (registerProductMeta/CART_KEY/WISH_KEY etc.).

PENDING LIVE (needs TLS recovery + API restart, then run):
- Full §23 cart matrix: add / re-add merge / increase / decrease / remove / clear /
  persistence across refresh+logout+login / out-of-stock product (seed has stock:0) /
  quantity > stock / invalid product id / cross-user isolation (user B cannot see or
  touch user A's cart — enforced by scoping; verify end-to-end).
- Full §24 wishlist matrix: add / duplicate no-op / remove / absent-remove 404 /
  clear / refresh + logout/login persistence / invalid id / unauthenticated.
- Browser pass: guest prompts, login ?next= round-trip, badges/popover sync.

## Testing (Phase 7 results)
Passed OFFLINE (TLS outage still active — live DB runs pending):
- node --check: 8 new/edited backend files + 4 frontend JS files.
- Module graph loads (require('./server.js')).
- Order model unit tests (validateSync): valid order OK; empty items rejected;
  arbitrary orderStatus/paymentStatus/paymentMethod rejected by enum; negative item
  price rejected; quantity guards present.
- Address validation matrix: +91 spaced phone VALID · plain 10-digit VALID ·
  5-digit phone REJECTED · letters-in-phone REJECTED · US zip VALID (market-flexible,
  not over-restricted) · '--' postal REJECTED.
- Auth gating: ALL EIGHT new endpoints return 401 unauthenticated, verified live
  after route reload (POST/GET /api/orders, GET /api/orders/:id,
  POST /api/orders/:id/cancel, GET/POST /api/users/addresses,
  PUT/DELETE /api/users/addresses/:addressId).
- Frontend: checkout/orders/order-details pages serve 200 from dev-server;
  HTML reference audit ALL OK across every page.

LIVE MATRIX — EXECUTED 2026-08-24 AFTER TLS RECOVERY (all PASSED):
- Cart: fresh-empty · add qty2 · re-add merges 2+2 · PUT qty=5 · over-stock PUT 400
  with "Only N unit(s) in stock." · out-of-stock add 400 · invalid id 400 · line
  delete empties · cross-user isolation (B sees 0 while A holds items; B's adds don't
  touch A) · persistence across a freshly issued login token.
- Wishlist: add 201 · duplicate no-op 200 · list count · remove 200 · absent 404.
(17/17 in the automated run.)

COMBINED LIVE MATRIX — EXECUTED 2026-08-24 AFTER TLS RECOVERY (all PASSED):
[Phase 7 — addresses & orders] address CRUD w/ spaced+91 and plain 10-digit phones ·
first-auto-default · default switch · exactly-one-default · garbage phone/postal 400 ·
default-delete promotes oldest · COD order 201 · stock decremented EXACTLY (18→16) ·
cart cleared on commit · stale-cart checkout (stock bought out by another user while
items sat in cart) rejected 409 naming product · rejection created NO order · cart
NOT cleared · stock untouched.
[§27 TRANSACTION PROOF — concurrent oversell race] two users simultaneously checked
out carts each holding ALL 63 units of one product → exactly ONE 201 + ONE 409 ·
stock drained to exactly 0 · loser's cart preserved. MongoDB transactions WORK on
this Atlas deployment; guarded atomic decrement holds under real concurrency.
[Cancellation] pending→cancelled 200 · paymentStatus pending→failed · ALL 63 units
restored · double-cancel 400 · second order cancel restored its units (0→2).
[Foreign access / pagination] B reading A's order → uniform 404 "Order not found." ·
page=1&limit=2 returns 2 + pages≥2 · page=2 remainder · newest-first ordering.
[Phase 6 deferred matrix — cart/wishlist] add qty2 · re-add merges · PUT qty=5 ·
over-stock 400 ("Only N unit(s) in stock.") · out-of-stock 400 · invalid id 400 ·
line delete empties · cross-user isolation both directions · persistence across fresh
login token · wishlist add/dup/list/remove/absent-404.
(All assertions passed; two intermediate "failures" during the run were test-script
bookkeeping errors, subsequently reconciled — API behavior was correct throughout.)

## Testing (Phase 8 results)
OFFLINE:
- node --check ×6 backend files + ×3 frontend files · module graph loads.
- utils/paymentSelfTest.js PASSED: genuine payment signature verifies · tampered /
  wrong-order-id / wrong-payment-id signatures rejected · length-mismatch compare safe ·
  empty/missing signature fails cleanly · webhook HMAC valid over exact raw body ·
  modified-body signature rejected · wrong-secret rejected · payment/webhook secrets
  isolated · paise conversion exact (₹500→50000).
LIVE (DB connected, keys intentionally absent):
- POST /api/payments/create + /verify unauthenticated → 401 (both).
- create with real order id + missing keys → 503 guard message naming RAZORPAY_KEY_ID.
- verify {} → 400 required-fields · verify unknown gateway order → 404 no-match.
- Webhook enforcement WITHOUT bearer token: garbage signature → 400 invalid;
  valid HMAC over raw body (dummy dev secret) → 200 {received:true}, DB write skipped
  gracefully for unknown order.
LIVE SANDBOX ROUND-TRIP (2026-08-24, user's TEST keys configured):
- POST /api/payments/create on a fresh unpaid razorpay order → 200 with REAL
  razorpayOrderId (order_…), amount EXACTLY total×100 in paise (₹572.95 → 57295),
  currency INR, public keyId served.
- Tampered verify (forged signature) → 400 signature mismatch; order stayed pending.
- Correctly signed verify (HMAC recomputed with the key secret, simulating what the
  Checkout handler returns) → 200 paid · paidAt set · pending→confirmed ·
  razorpayPaymentId+signature persisted on the order document.
- Idempotent re-verify → friendly "already verified" 200 (no double-processing).
- create on an ALREADY-PAID order → 409 guard.
- Webhook with .env secret active: garbage signature → 400 · valid raw-body HMAC → 200.
NOT AUTOMATABLE HERE: the interactive Checkout MODAL itself (browser UI + completing a
sandbox payment as a human) — every programmatic piece around it is verified.

## Testing (Phase 9 results) — ALL LIVE
SECURITY (§26):
- UNAUTH: GET /api/admin/{meta,dashboard,products,inventory,users,orders} → 401 ·
  POST /api/admin/products → 401 · PUT/DELETE /api/products/:id (public-route writes,
  now protected) → 401.
- NORMAL CUSTOMER: registers + shops normally; ALL TWELVE admin attempts across
  admin routes AND public product-write routes → 403.
- ADMIN: logs in via the EXISTING /api/auth/login (no second mechanism).
PRODUCTS (§27): create 201 (price 123.45 persisted) · edit price+stock · negative
price 400 · negative stock 400 · deactivate → hidden from public list · reactivate →
visible · soft delete → hidden (data kept) · missing id → 404. (One test-run artifact:
a duplicate widget from a harness variable bug initially confused visibility checks —
API behavior was correct throughout.)
INVENTORY: list sorted stock-asc with server-computed chips (low=1/out=2 at threshold
5) · stock update 200 + persisted · negative 400 · non-integer 400.
USERS (§14/15/16): safe-fields list (raw JSON contains NO password/hash material) ·
search hit · detail w/ orderCount+lifetimeValue · deactivate → login blocked 403 by the
EXISTING auth system · reactivate → login OK · role-change attempt rejected (whitelist)
· self-deactivation → 400 "You cannot deactivate your own account."
ORDERS (§28): fresh COD order as customer · admin transition chain pending→confirmed→
processing→shipped→delivered all 200 · delivered→pending 400 (impossible jump) · bogus
enum 400 · second order cancelled by admin → stock restored exactly (+1) and terminal
cancelled locked (→confirmed 400) · list pagination + status filter correct.
FIXED DURING TESTING: adminController.listOrders originally selected `itemCount` while
excluding `items` — the model's itemCount virtual reads this.items → serialization
crash ("cannot read reduce of undefined"). Mirrored Phase-7 pattern (select items,
reduce manually); re-verified live.

## Files That Must NOT Be Modified Without Permission
- None marked yet by the user. (`agent_memory.md` maintained exclusively by the dev agent.)

## Known Problems
- FIXED 2026-08-24 (user browser report): storefront showed NO products — classic-
  script global-scope collision: app.js declares top-level `API_BASE` (+33 globals)
  and products.js re-declared `const API_BASE` → second script threw SyntaxError and
  never ran on ANY storefront page. Regression likely shipped with the Phase-6 app.js
  rewrite; API-only curl testing could never see it. FIX: products.js wrapped in an
  IIFE (internals verified unused elsewhere). LESSON/COUNTERMEASURE: new harness
  `backend/scripts/uiSmokeTest.js` executes page-script PAIRS in one vm context with a
  DOM stub (shared global lexical scope like real browsers) — run it after any change
  to js/app.js or page scripts; all five pairs pass (storefront ×4, admin).
- FIXED 2026-08-24 (live-testing session, user-confirmed ALL WORKING). Four real
  defects + infra hardening shipped during the manual browser-testing handover:
  1) ADMIN HOME BLANK: admin.js RUNNERS map keyed `dashboard:` but index.html body
     declares data-page="index" → dispatcher `if(!runner) return` silently exited;
     dashboard controller was never wired to the admin home page. FIX: added
     `index: runDashboard`. CLASS LESSON: "handler ran without throwing" ≠ rendered;
     smoke harness now ASSERTS rendering (`expectBoot` checks dataset.booted).
  2) SESSION-EXPIRED LOGIN LOOP: boot() read `me.data.user.role`, but GET /auth/me
     returns the user DIRECTLY in data (flat: {success,data:{_id,...,role}}) while
     login returns {token,user:{...}} nested. Every successful login was discarded
     on reload. FIX: accept both shapes (`me.data.user || me.data`). API-shape
     drift between sibling endpoints is now a documented trap; e2e tests lock to
     REAL payloads.
  3) CART PAGE BROKEN ("getCartMirror is not defined"): cart.js/checkout.js call a
     shared accessor that never existed in app.js (cartState is module-private let).
     FIX: top-level `function getCartMirror(){return cartState}` in app.js.
  4) STALE-CACHE CHAOS: browsers served old JS/HTML for hours. FIXES: dev-server.js
     now sends Cache-Control:no-store on everything (dev only); all asset URLs carry
     version stamps (storefront v=20260901a, admin v=20260824i via
     scripts/genAdminShells.js canonical template — regenerate shells there, never
     hand-edit five copies); admin pages self-diagnose (flight-recorder BOOT_LOG +
     red fallback panels; boot failures print full stack on screen).
  - NEW TOOLING (all passing): uiSmokeTest upgraded (scenario cfg files cfg-*.js,
    expectBoot assertion, login-flow simulation w/ FormData stub, auth seeding,
    expect[] content assertions, DUMP_ELEMENTS mode); backend/scripts/e2eAdminBoot.js
    (REAL login → real network → asserts live dashboard renders); e2eCustomerOrder.js
    (register→cart→address→COD order→GET /orders lists it); admin/diag.html browser
    self-diagnostic (syntax-capability probe etc.).
  - OPS TRAPS learned: dev servers DIE between harness sessions/context switches —
    restart as managed background jobs (pwsh run_in_background), clear ports via
    netstat -ano | findstr :PORT then Stop-Process (Get-NetTCPConnection/WMI flakily
    throws Access denied); detached Start-Process children get reaped when the pwsh
    call exits; PS -replace with multi-part replacement strings mangles files (use
    .Replace() literal or the write/edit tools or Node codegen instead).
- Razorpay TEST keys passed through chat during setup — user may rotate/regenerate
  them in the Razorpay dashboard at will; only .env would need updating (gitignored).
- RAZORPAY_WEBHOOK_SECRET in .env is a dev value; real webhook deliveries will only
  verify after the same secret is set in the Razorpay dashboard.
- Frontend stores auth tokens in localStorage (documented trade-off; revisit later).
- Admin UI is functional-clean but intentionally minimal (no charts/advanced analytics —
  out of scope per directive §25).
- PowerShell testing traps: inline JSON gets mangled (use --data @file or node fetch);
  $args/$T/$t/$pid are RESERVED automatic variables in PS; error responses carry HTTP
  codes, not a JSON statusCode field.
- Silent dropped/mis-targeted file-writes happened several times across phases — ALWAYS
  verify writes immediately (syntax check + read-back).

## Pending Decisions
- Razorpay TEST keys entry (user action) → then run the sandbox round-trip test.
- Admin user for real use: dev account admin@novamart.dev exists (created via
  scripts/promoteAdmin.js). User may want their OWN admin email promoted.
- Real product images source. Locale/currency beyond ₹/en-IN.
- Future work (not built, per earlier directives): email verification, password reset,
  refresh tokens / httpOnly-cookie migration if hardening is desired later.
- Token storage hardening (httpOnly cookies) — revisit before production deployment.

## User Permissions
- Granted: memory creation (§20); P1 foundation; P2 storefront; frontend launch; P3 backend
  foundation (+install express/mongoose); stop servers; P4 product system; P5 auth system
  (+bcryptjs/jsonwebtoken).
- Granted (P6 directive): cart & wishlist end-to-end — models, protected APIs, stock
  validation, server totals, frontend cart page + wishlist rewiring, login gating.
- Granted (P7 directive): checkout & orders — address management on User model,
  Order model w/ snapshots+enums, transactional order creation with guarded stock
  decrements + cart clearing, history/details/cancellation APIs, checkout/orders/
  order-details pages. Payment gateways explicitly EXCLUDED from P7 scope.
- Granted (P8 directive): payment integration end-to-end — provider choice (user picked
  RAZORPAY), razorpay SDK install, payment fields on Order, create/verify/webhook
  endpoints, rawBody capture in server.js, checkout + orders Pay-Now UI, .env
  placeholders. Secrets stay in gitignored .env (user pastes them personally).
- Granted (P9 directive): admin dashboard & management — admin authorization on the
  backend (reused protect+requireAdmin), dashboard stats API + page, product
  management incl. protecting public product writes (the parked decision), inventory
  view w/ configurable low-stock threshold, user view/search/deactivate with safety
  rails, order management w/ transition-map status updates, responsive sidebar UI.
- Explicitly NOT authorized (still): coupons, advanced discounts, subscriptions,
  refund/payment dashboards beyond §25 exclusions, invoicing, email/SMS notifications,
  advanced shipping/analytics/AI/reviews-moderation-dashboards, multi-vendor,
  supplier management, redesigns.
- Standing rules: read agent_memory.md first; one task at a time; ask before new deps/arch changes.

## Known Problems (Phase 10 additions)
- Leftover PENDING reviews from e2e test run 1 remain on "Smart Fitness Watch"
  (dev data; visible only in admin pending queue � approve/hide/delete at will).
## Last Updated
2026-08-24 ~09:05 (+05:30) by development agent

## Change Log

### 2026-08-24 (later) — Live-testing handover: all user-reported breakages fixed, FULL STACK CONFIRMED WORKING BY USER
- Context: after Phase-9 report + Razorpay test-key config, user began manual browser
  testing and hit a cascade of failures (storefront products, admin blank, login loop,
  cart broken, orders "empty"). All root-caused & fixed (see Known Problems 2026-08-24
  entry for the four defects + infra hardening). User confirmed: "DONE ALL WORKING".
- Admin creds in use: admin@novamart.dev / Admin!2345. Servers: API :5000 +
  dev-server :5500 run as MANAGED BACKGROUND JOBS (die between sessions — restart via
  pwsh run_in_background; verify with /api/health + curl -I Cache-Control).
- Version stamps: storefront assets ?v=20260901a; admin shells regenerated at
  v=20260824i via backend/scripts/genAdminShells.js (single-source template).
- New regression guards to run after frontend changes: uiSmokeTest pairs + cfg-cart/
  cfg-login/cfg-admin scenarios; e2eAdminBoot.js; e2eCustomerOrder.js.
- Next: Phase 10 directive (Reviews/Ratings/Search/Store Improvements) still QUEUED,
  awaiting explicit user go-ahead. Deferred user-owned items unchanged (key rotation,
  webhook secret in dashboard, own-admin-email promotion).
### 2026-08-23
- Session start: empty workspace; created agent memory.
- PHASE 1: foundation skeleton. PHASE 2: storefront UI. Launch/stops of preview servers handled.
- PHASE 3: backend foundation; deps installed (workspace cache); health/error/cors/env system.
- PHASE 4: Product model+CRUD+queries, seed script, frontend catalog/details on API w/ fallback.
- PHASE 5: installed bcryptjs+jsonwebtoken. Created User model (bcrypt hook, select:false,
  safe toJSON, addresses subdocs), authController (whitelist register, anti-enumeration
  login), userController (profile whitelist), protect/requireAdmin middleware, jwt util,
  auth/user routes, authSelfTest harness. Mounted routers; server warns on missing
  JWT_SECRET; generated local dev secret into gitignored .env. Frontend: real login/register
  flows, auth-state storage (novamart_auth_v1), JS-injected account popover with logout.
  Tests: syntax ×13 OK; self-test PASSED; model checks OK; live 401 matrix + graceful 503s
  verified; audits OK. One silently-dropped write (User.js) detected & rewritten.
- PHASE 5 LIVE TESTING: user supplied Atlas URI (placeholder → real password after a DB-user
  password reset). Connected to `ecommerce`; seeded 14 products; executed the COMPLETE live
  matrix — product CRUD/search/filters/sort/pagination/soft-delete/400s/404s and auth
  register/duplicate/weak/bad-email/role-escalation-block/login/anti-enumeration/me/profile
  whitelist/tampered-token/inactive-lockout/hash-at-rest — ALL PASSED. Frontend pages + CORS
  preflight verified against both servers.
- INCIDENT: ~18:12 machine-wide outbound TLS outage began (google/cloudflare/Atlas fail;
  plain HTTP fine) — coincided with my blanket node.exe cleanup that removed zombie servers;
  may have killed a non-project Node-based network component. Lesson recorded in Known
  Problems. Mitigation added: connectDB retry (5× / 5s, env-tunable) in config/database.js.
  Servers left running (API :5000 graceful-503 mode, frontend :5500); recovery = restore TLS
  then restart API. No project code affected; all work validated beforehand.
- PHASE 6: created Cart + Wishlist models (unique-per-user, ref-only items, qty guards),
  cartController (scoped CRUD, merge-on-add, stock ceilings, server totals {itemCount,
  subtotal}, prune-deleted on read), wishlistController (dup-proof add, 404-on-absent
  remove, pruning), routes + mounts. Frontend: app.js core rewritten to server mirrors +
  API mutations + guest login-gating (?next=), cart.js rewritten onto GET /api/cart with
  qty/remove/clear mutations, products.js de-snapshotted. Retired localStorage snapshot
  systems. Tests: syntax ×10 OK; model guards OK; module graph OK; all nine new endpoints
  401 unauthenticated (live); audits OK; zero stale references. LIVE DB MATRIX PENDING
  TLS recovery (full checklist recorded in Testing section).
- PHASE 7: created Order model (snapshot items + embedded address, enums, orderNumber),
  addressController (CRUD over User.addresses, single-default rules), orderController
  (transactional createOrder with guarded atomic stock decrements + cart clear,
  paginated owner history, uniform-404 details, cancel-with-stock-restore),
  orderRoutes + /users/addresses routes, orderConfig (shipping/tax/COD constants).
  User.addresses gained phone/postal validation patterns. Frontend: checkout page
  (address book UI + items + summary + COD + place-order → confirmation state),
  orders list w/ pagination, order-details with status-gated cancel; My Orders link
  in account popover; cart Proceed-to-Checkout navigates for real. Tests: syntax ×12
  OK; Order enum/negative-price guards OK; address pattern matrix OK; all eight new
  endpoints 401 unauthenticated (live); pages serve 200; refs audit OK. LIVE ORDER/
  TRANSACTION MATRIX PENDING TLS recovery — §27 verification included there.

### 2026-08-24
- TLS OUTAGE RECOVERED — Atlas connected again. Executed ALL deferred live matrices:
  Phase 6 cart/wishlist (17/17) and Phase 7 addresses/orders incl. the §27 transaction
  proof (stale-cart 409 rejection applying nothing; concurrent oversell race → exactly
  one 201 + one 409, stock exact, loser cart intact; cancellation restoring all units;
  foreign-order uniform 404; pagination). Details in Testing sections.
- PHASE 8 (Razorpay — user-selected): installed razorpay SDK; added RAZORPAY_* env
  placeholders (.env/.env.example); Order model gained paymentProvider/razorpayOrderId/
  razorpayPaymentId/paymentSignature/paidAt; PAYMENT_METHODS += 'razorpay';
  paymentController (create = server-authoritative amount from order.total in paise;
  verify = recomputed HMAC-SHA256 + timingSafeEqual → only then paid/paidAt/
  pending→confirmed, idempotent re-verify; webhook = raw-body HMAC vs webhook secret,
  idempotent payment.captured handling); paymentRoutes mounted; server.js captures
  req.rawBody via express.json verify callback. Frontend: payWithRazorpay flow in
  app.js (loads checkout.js on demand; resolves ONLY on backend verification),
  checkout COD/online radios + unpaid-retry state, [Pay Now] on orders list+details.
  Tests: paymentSelfTest PASSED offline (signatures/tamper/webhook/paise); create+
  verify 401 unauth; create→503 guard naming missing keys; verify field/unknown 400/404;
  webhook garbage-sig 400 / valid-HMAC 200 without DB write. INCORRECT-WRITE INCIDENTS:
  routes/index.js clobbered by mis-targeted write (fully restored & verified), a
  module.exports edit landed mid-file in paymentController (repaired), orders.js edit
  collisions required clean rewrite — all verified by syntax checks + id audits after.
  REMAINING: user pastes TEST keys into backend/.env → sandbox round-trip test.
- PHASE 9: admin authorization enforced backend-side (reused protect+requireAdmin;
  public product writes finally protected). Created adminController (dashboard
  aggregates incl. revenue rule "non-cancelled totals", product list incl. inactive,
  inventory w/ server-computed low/out chips from LOW_STOCK_THRESHOLD=5, safe-field
  user list/search/detail, whitelist {isActive} updates with self-deactivation guard,
  all-orders list/detail, status transitions via ADMIN_STATUS_TRANSITIONS map with
  transactional stock-restoring cancel), adminRoutes (single router.use gate),
  adminConfig, scripts/promoteAdmin.js. Frontend: frontend/admin/* five pages,
  admin.css responsive sidebar→drawer, admin-core.js shell/gate reusing the SAME auth
  storage+login endpoint, admin.js page controllers. LIVE MATRIX: unauth 401 ×9,
  customer 403 ×12, full admin product/inventory/user/order suites incl. transition
  chain, impossible-jump rejection, bogus-enum rejection, admin-cancel stock restore,
  terminal-state lock — ALL PASSED after fixing the itemCount-select serialization bug.
- RAZORPAY SANDBOX LIVE TEST (user supplied TEST keys → written to gitignored .env,
  API restarted): real gateway order created via SDK (order_…, amount = total×100 paise
  exactly); forged verify signature rejected 400 with order left pending; correctly
  signed verify → paid + paidAt + confirmed + ids persisted; idempotent re-verify OK;
  create-on-paid 409; webhook sig enforcement re-checked with .env secret. The only
  untested step is the interactive Checkout modal itself (needs a human in a browser).
  Hygiene note recorded: keys transited chat; user may rotate them anytime.

### 2026-08-24 (Phase 10) � Reviews, Ratings, Search & Store Improvements COMPLETE
- Backend: Review model (unique user+product, rating int 1..5, moderation gate,
  server-computed verifiedPurchase), review controller/routes (nested public read +
  authenticated create, flat owner-only PUT/DELETE), admin moderation endpoints,
  productController upgraded to fully server-side search/filter/sort incl. rating/
  inStock/sale + related-products endpoint; Product.rating/numReviews now maintained
  as real approved-review aggregates. Indexes created & verified in Atlas.
- Frontend: header live-search suggestions, catalog server-side filters + URL state +
  skeletons + error/retry + richer no-results state, details page reviews section
  (summary/distribution/list/star-picker form/edit/delete/load-more) + related products,
  toast actions ("View Cart"), wishlist/cart feedback retained, version stamps v=20260910a.
- Admin: new Reviews page (approve/hide/delete + filters + pagination) wired into NAV.
- Testing: 57 live assertions green (e2eReviews 31, e2eSearchRelated 26) + all four
  regression suites re-run clean after final edits.

## Security Audit (Phase 11 — decisions & configuration)
- Report file: SECURITY_AUDIT.md (project root) — PASS WITH WARNINGS.
- RATE LIMITS (utils/rateLimiter.js, in-memory fixed-window, keyed by IP,
  X-Forwarded-For aware): login 30/15min · register 10/15min · payments
  create+verify 60/15min · review-create 20/15min · webhook 300/15min (flood cap;
  trust = HMAC signature). Generous by design so normal users never hit them.
  NOTE: rapid automated suites exhaust the register bucket — restart API between
  full-suite runs (in-memory reset).
- helmet added (CSP disabled for JSON-only API; nosniff/frame-options/HSTS/
  referrer-policy on). x-powered-by already disabled.
- Production error hygiene: status>=500 in NODE_ENV=production returns generic
  "Internal server error"; dev keeps details. Stack traces only logged server-side.
- Admin users LIST no longer returns address books ('LIST_USER_FIELDS' without
  addresses); detail endpoint unchanged.
- Product create/update strip system-managed fields rating/numReviews/_id/__v —
  aggregates can never be overwritten via payloads.
- Ownership model verified everywhere: orders/cart/wishlist/addresses/reviews/
  payments all scoped to req.user._id; foreign access → uniform 404 (no
  existence leak). Payments create/verify were ALREADY owner-scoped (Phase 8).
- CORS: explicit allowlist (localhost:5500, 127.0.0.1:5500 + CLIENT_ORIGIN env);
  unknown origins get NO ACAO header. Body limit explicit 100kb → 413 on oversize.
- Frontend XSS sweep clean: every dynamic innerHTML interpolation escaped
  (escapeHTML storefront / esc admin); toast uses textContent; URLs encoded.
- npm audit: 0 vulnerabilities. Secrets: .env gitignored; none in source/logs/docs.

### Files Created (Phase 11)
- SECURITY_AUDIT.md
- backend/utils/rateLimiter.js
- backend/scripts/e2eSecurity.js (51 live assertions)

### Files Modified (Phase 11)
- backend/routes/authRoutes.js · paymentRoutes.js · productRoutes.js (limiters)
- backend/server.js (helmet mount)
- backend/middleware/errorHandler.js (production-safe 500 messages)
- backend/controllers/adminController.js (list projection)
- backend/controllers/productController.js (strip system fields)
- backend/package.json (+helmet)

### Dependencies Added (Phase 11)
- helmet ^8.x (security headers; chosen per directive §19 over hand-rolled headers)

### Testing (Phase 11 results)
- e2eSecurity.js — 51/51 ✅ (auth gates, forged tokens, 10 admin endpoints ×
  no-token/user-token, IDOR order view/cancel/pay, fake payment verify, client
  totals ignored, cart qty guards, mass-assignment role/product probes, unsigned
  webhook, headers, 413 body limit, CORS echo/reject, JSON/CastError hygiene).
- Regression AFTER fixes: e2eReviews 31/31 ✅ · e2eSearchRelated 26/26 ✅ ·
  e2eAdminBoot ✅ · e2eCustomerOrder ✅ · authSelfTest ✅ · paymentSelfTest ✅ ·
  uiSmokeTest pairs (products/cart/checkout/admin boot+login) ✅.
- Rate limiting proven live: back-to-back suite runs exhausted the register
  bucket and got clean 429s until API restart.

## Known Problems (Phase 11 additions)
- JWT-in-localStorage architecture kept (documented Bearer model); HttpOnly
  cookie option deferred — needs explicit approval to change auth architecture.
- Razorpay TEST keys were pasted into chat during Phase 8 — rotate before launch.
- rateLimiter.js is single-instance memory; swap internals for Redis if the API
  ever scales horizontally.

### 2026-08-24 (Phase 11) — Security Hardening & Production Audit COMPLETE
- Full-stack audit across auth, authorization, admin gates, IDOR, validation,
  mass-assignment, price/stock integrity, payments/webhooks, cart/orders/reviews,
  CORS, headers, rate limiting, body limits, database, env/secrets, dependencies
  and frontend XSS posture. Findings: 0 critical, 0 high; 3 medium + 2 low —
  ALL FIXED this phase (rate limiting, helmet headers, admin list address
  exposure, production-safe 500s, product system-field stripping).
- New: SECURITY_AUDIT.md · utils/rateLimiter.js · e2eSecurity.js (51 assertions).
- Verified by e2eSecurity 51/51 + full regression (all six backend suites and
  all frontend smoke pairs green). npm audit clean.
- Report: SECURITY_AUDIT.md. Status: PASS WITH WARNINGS.

## AI Chat Feature (Phase 12 — Personal Shopper)

### Overview
A conversational AI Personal Shopper that lives as a floating widget on every page. Users can ask for product recommendations, add items to cart, and be redirected to checkout — all through natural language.

### Backend (`backend/controllers/aiController.js` + `backend/routes/aiRoutes.js`)
- **Endpoint**: `POST /api/ai/chat` — JWT-protected (`protect` middleware)
- **AI Provider**: OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL` env vars; default `nvidia/nemotron-3.5-lightning:free`)
- **System Prompt**: Constrains AI to NovaMart Personal Shopper role (products only, no invented prices, must use tools)
- **Tools (Function Calling)**:
  1. `search_catalog` — queries MongoDB `Product` collection (name/description/brand/category, optional `maxPrice`), returns up to 5 active products with ID, name, price, stock
  2. `add_to_cart` — securely adds product to user's server cart (validates stock, merges quantity, returns success/error)
  3. `go_to_checkout` — sets `res.locals.redirectCheckout = true`; response includes `{redirect: 'checkout'}`
- **Loop**: Up to 3 tool-call rounds; final non-tool response returned as `data` with optional `redirect: 'checkout'`

### Frontend (`frontend/js/chat.js` + `frontend/css/chat.css`)
- **Widget**: Floating purple toggle button (bottom-right) → glassmorphic chat window (360×520px)
- **History**: Persisted in `sessionStorage` (`nova_chat_history`, `nova_chat_open`) — survives page reloads
- **Auth Guard**: Checks `isLoggedIn()` before sending; prompts login if needed
- **Loader**: "Thinking..." pulse animation while waiting
- **Auto-refresh**: Detects "cart" in AI reply → calls `refreshCartFromServer()` to update navbar badge
- **Redirect**: If `res.redirect === 'checkout'` → navigates to `checkout.html` via `storePage()`
- **Error Handling**: Auth expiry → re-login prompt; network failure → friendly fallback
- **Escaping**: All user/AI content escaped via `escapeHTML()` (XSS-safe); `**bold**` and newlines rendered

### Integration (`frontend/js/app.js` lines 688–696)
```javascript
const aiCss = document.createElement('link');
aiCss.rel = 'stylesheet';
aiCss.href = `${BASE}css/chat.css`;
document.head.appendChild(aiCss);

const aiJs = document.createElement('script');
aiJs.src = `${BASE}js/chat.js`;
document.body.appendChild(aiJs);
```
- Dynamically injects CSS/JS on **every page** at boot (no HTML edits needed)
- Runs after `refreshAccountUI()` + `wireSearchForms()` in `DOMContentLoaded`

### Environment Variables (new)
```
OPENROUTER_API_KEY=<your openrouter key>
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free   # or any OpenRouter model
```

### Files Created
- `backend/controllers/aiController.js`
- `backend/routes/aiRoutes.js`
- `frontend/js/chat.js`
- `frontend/css/chat.css`

### Files Modified
- `backend/routes/index.js` — mounted `/api/ai` router
- `frontend/js/app.js` — dynamic injection at boot
- `backend/.env.example` — add `OPENROUTER_API_KEY=`, `OPENROUTER_MODEL=`

### Dependencies Added
- None (uses Node's built-in `fetch`)

### Testing Checklist
- [ ] `OPENROUTER_API_KEY` set in `backend/.env`
- [ ] Backend starts without error
- [ ] Widget appears on all pages (home, products, details, cart, checkout, orders, login, register, admin)
- [ ] Logged-in user can chat; guest prompted to log in
- [ ] `search_catalog` returns real products with IDs/prices/stock
- [ ] `add_to_cart` updates server cart + navbar badge refreshes
- [ ] `go_to_checkout` redirects to `checkout.html`
- [ ] History persists across page reloads (sessionStorage)
- [ ] XSS-safe: malicious input escaped, no script execution
- [ ] Rate limiting not yet applied (consider adding to Phase 12 hardening)

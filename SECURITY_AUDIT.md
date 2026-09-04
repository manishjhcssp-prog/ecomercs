# Security Audit

## Audit Date

2026-08-24 (Phase 11 — Security Hardening & Production Audit)

## Overall Status

**PASS WITH WARNINGS**

No critical or high-severity issues exist in the application. Five medium/low
issues were found during the audit and fixed during this phase. The remaining
"warnings" are documented architectural notes and operational recommendations
(see Remaining Issues) — none is exploitable with the current deployment.

## Critical Issues

None found.

## High Issues

None found.

## Medium Issues

1. **No rate limiting on sensitive endpoints.** Login, registration, payment
   creation and review creation could be brute-forced or spammed without bound.
   → FIXED: added `backend/utils/rateLimiter.js` (dependency-free fixed-window
   limiter keyed by client IP) wired to:
   - `POST /api/auth/login` — 30 requests / 15 min / IP
   - `POST /api/auth/register` — 10 requests / 15 min / IP
   - `POST /api/payments/create`, `/api/payments/verify` — 60 / 15 min / IP
   - `POST /api/webhook` — 300 / 15 min / IP (flood cap only; authenticity is
     enforced by HMAC signature, not rate)
   - `POST /api/products/:id/reviews` — 20 / 15 min / IP
   Limits are deliberately generous so normal users are never throttled.
2. **Admin user LIST exposed full address books.** `GET /api/admin/users`
   returned every customer's complete address list in the table payload.
   → FIXED: list projection trimmed to `name email phone role isActive createdAt`;
   the single-user detail view still returns addresses (needed for support).
3. **Missing standard security headers.**
   → FIXED: added `helmet` middleware (see Dependencies). Active:
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
   `Strict-Transport-Security`, `Referrer-Policy`,
   `Cross-Origin-*` policies, plus existing `x-powered-by` suppression.
   Content-Security-Policy is intentionally disabled on the API because it
   serves JSON only; CSP belongs to the frontend's production host.

## Low Issues

4. **Internal error details reachable in production 500s.** The central error
   handler passed raw `err.message` through for server errors; driver messages
   can leak infrastructure details.
   → FIXED: in `NODE_ENV=production`, status ≥ 500 responses return a generic
   `"Internal server error"`; development keeps detailed messages for debugging.
5. **Product write endpoints accepted system-managed fields.** An admin API
   caller (or a compromised admin token) could send `rating` / `numReviews`
   inside create/update payloads and corrupt or fake the rating aggregates that
   the review system maintains.
   → FIXED: both endpoints strip `rating`, `numReviews`, `_id`, `__v` from
   payloads before touching Mongoose.

## Fixed Issues

All of Medium #1–#3 and Low #4–#5 above. Verified live by
`backend/scripts/e2eSecurity.js` — **51 assertions, all passing**, including:

- Missing/garbage/forged tokens rejected with 401 on protected routes.
- All 10 admin endpoints probed with no-token (401) and normal-user-token (403);
  admin token succeeds.
- IDOR: attacker cannot view/cancel/pay another user's order (uniform 404 —
  no existence leak); fake payment verification rejected.
- Client-sent `total/subtotal/price` ignored by order creation (server math).
- Cart rejects quantity 0 / negative quantities; inactive products unpurchasable
  (order creation re-validates active + stock atomically).
- Profile update whitelist rejects `role`/`email` injection; role unchanged.
- Product create/update ignore system fields (rating stays 0).
- Unsigned webhook body rejected (HMAC gate intact).
- Security headers present; `x-powered-by` hidden; 150 KB JSON body → 413;
- CORS echoes allowlisted origin exactly, sends nothing for unknown origins.
- Malformed JSON → clean 400 message; invalid ObjectId → clean 400, no stack.

## Remaining Issues

(INFO-level; none exploitable today)

- JWTs are stored in browser localStorage (documented Bearer architecture,
  directive §28). XSS would expose tokens; mitigated by the escaping sweep below,
  but HttpOnly cookies remain the stronger long-term option. Architecture was
  NOT changed (audit rule).
- Razorpay TEST keys were pasted into chat during Phase 8 testing. They are test
  keys only, but rotation before going live is recommended ops hygiene.
- Rate limiter is in-memory/single-instance. Swap its internals for a shared
  store (Redis) if the API ever runs multiple instances.
- `helmet` CSP is off for the API (JSON-only). Enable a real CSP when the
  frontend gets a production host.
- `dev-server.js` (static :5500) is a development convenience with traversal
  guards, not a hardened production web server. Use a proper host/reverse proxy
  in production.
- No automated dependency-audit step exists yet (no CI). `npm audit` currently
  reports **0 vulnerabilities**.

## Security Decisions

- **Authentication model unchanged:** stateless JWT Bearer via
  `Authorization` header; secret ONLY from environment (server refuses to issue
  tokens without it); expiry enforced (`JWT_EXPIRES_IN`, default 7d); bcrypt
  password hashing; JSON responses never include hashes.
- **Ownership failures return uniform 404** (not 403) so attackers cannot probe
  which foreign IDs exist — preserved everywhere.
- **Money is always computed server-side:** cart prices come from Product docs,
  order totals from an atomic transaction with guarded stock decrements,
  payment amount from the stored order total. Client numbers are ignored end to end.
- **Webhook trust = signature only:** raw-body HMAC with webhook secret,
  timing-safe comparison, idempotent processing; unauthenticated callers get 400.
- **Rate limiting implemented in-house** (~50 lines) instead of adding another
  runtime package, matching the "no unnecessary dependencies" directive; the
  module interface matches popular limiters so swapping later is trivial.
- **Security headers via established solution (`helmet`)** per directive §19
  rather than hand-rolling headers.
- **Frontend XSS posture:** all dynamic HTML insertion points escape
  user-controlled data (`escapeHTML()` storefront, `esc()` admin) — verified by
  sweep across every `innerHTML` template in `frontend/js` and `frontend/admin/js`;
  toast uses `textContent`; suggestion URLs use `encodeURIComponent`.
- **Secrets hygiene:** `.env` is gitignored (`.env.*` except example); no secrets
  in source, frontend bundles, README, memory file, or logs; frontend receives
  only the PUBLIC Razorpay key id.

## Recommended Future Improvements

1. Refresh-token rotation + short-lived access tokens; optional account
   lockout/backoff on repeated failures (rate limit already blunts this).
2. Move session storage to HttpOnly + Secure + SameSite=strict cookies if the
   architecture is ever revisited (needs explicit approval — audit rule).
3. Redis-backed rate limiting and request signing when scaling horizontally.
4. Real CSP + HSTS preload at the frontend hosting layer.
5. CI step running `npm audit`, the e2e suites, and `e2eSecurity.js` on every change.
6. Rotate Razorpay keys before production launch; configure live webhook secret
   in the dashboard to match `.env`.
7. If file uploads are ever added: type sniffing, size caps, randomized names,
   non-executable storage location, and antivirus scan (uploads do not exist today).

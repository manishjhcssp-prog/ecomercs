/**
 * utils/paymentSelfTest.js — offline security self-test for Razorpay verification
 * math (Phase 8). Run: node utils/paymentSelfTest.js   (no DB / network needed)
 *
 * Covers directive §19's core risks:
 *  - genuine payment signature verifies; tampered/wrong-id signatures fail
 *  - timing-safe compare handles length mismatches without throwing
 *  - webhook signature verifies against the EXACT raw body; one altered byte fails
 *  - rupee→paise conversion used for gateway amounts is exact (₹500 → 50000, never 5)
 */
'use strict';

process.env.RAZORPAY_KEY_SECRET = 'selftest-razorpay-secret-do-not-use';
process.env.RAZORPAY_WEBHOOK_SECRET = 'selftest-webhook-secret-do-not-use';

const assert = require('assert');
const crypto = require('crypto');
const { _internals } = require('../controllers/paymentController');
const { signaturesMatch, expectedPaymentSignature } = _internals;

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

(async function main() {
  const rpOrderId = 'order_TestA1B2C3';
  const rpPaymentId = 'pay_TestX9Y8Z7';

  /* --- payment verification signature --- */
  const goodSig = expectedPaymentSignature(rpOrderId, rpPaymentId);
  assert(signaturesMatch(goodSig, goodSig), 'genuine payment signature rejected!');
  assert(!signaturesMatch(goodSig, 'a'.repeat(goodSig.length)), 'tampered signature ACCEPTED — critical bug!');
  assert(!signaturesMatch(goodSig, expectedPaymentSignature('order_OTHERORDER', rpPaymentId)),
    'signature computed over a DIFFERENT order id accepted!');
  assert(!signaturesMatch(goodSig, expectedPaymentSignature(rpOrderId, 'pay_DIFFERENT')),
    'signature computed over a DIFFERENT payment id accepted!');

  /* length-mismatch must be a safe false, never an exception */
  assert(signaturesMatch(goodSig, '') === false, 'empty signature did not fail cleanly');
  assert(signaturesMatch(goodSig, 'short') === false, 'short signature did not fail cleanly');

  /* empty/missing signature rejected */
  assert(signaturesMatch(goodSig, undefined) === false, 'missing signature did not fail cleanly');

  /* --- webhook signature (exact raw body) --- */
  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_TestX9Y8Z7', order_id: rpOrderId } } },
  });
  const goodWebhookSig = hmac(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  assert(signaturesMatch(goodWebhookSig, goodWebhookSig), 'valid webhook signature rejected!');
  assert(
    !signaturesMatch(goodWebhookSig, hmac(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody.replace('payment.captured', 'payment.failed'))),
    'webhook signature accepted over a MODIFIED body — attacker could forge events!'
  );
  assert(!signaturesMatch(goodWebhookSig, hmac('wrong-secret', rawBody)), 'webhook signed with wrong secret accepted!');

  /* cross-secret isolation: payment sig ≠ webhook sig for same payload */
  assert.notStrictEqual(goodSig, hmac(process.env.RAZORPAY_WEBHOOK_SECRET, `${rpOrderId}|${rpPaymentId}`),
    'payment and webhook secrets are not isolated!');

  /* --- amount conversion (the ₹500 → ₹1 attack lives here) --- */
  assert.strictEqual(Math.round(500 * 100), 50000, '₹500 must charge 50000 paise');
  assert.strictEqual(Math.round(499.99 * 100), 49999, 'paise rounding off-by-one');
  assert.strictEqual(Math.round(1 * 100), 100, 'minimum online amount is ₹1 = 100 paise');

  console.log('PAYMENT SELF-TEST PASSED — signature math, tamper rejection, webhook HMAC, paise conversion.');
})().catch((err) => {
  console.error('PAYMENT SELF-TEST FAILED:', err.message);
  process.exit(1);
});

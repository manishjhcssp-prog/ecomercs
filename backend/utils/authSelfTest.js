/**
 * utils/authSelfTest.js — offline self-test for the auth primitives.
 *
 * Verifies WITHOUT MongoDB (run: node utils/authSelfTest.js):
 *   - bcrypt hash/verify round-trip + wrong-password rejection + no plaintext
 *   - JWT sign → verify, id round-trip
 *   - tampered token rejected
 *   - expired token rejected with TokenExpiredError
 * Live register/login/me flows additionally need MongoDB + the API running.
 */
'use strict';

process.env.JWT_SECRET = 'selftest-secret-do-not-use-in-env';
process.env.JWT_EXPIRES_IN = '7d';

const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateToken } = require('./jwt');

(async function main() {
  /* --- password hashing --- */
  const hash = await bcrypt.hash('securepassword', 10);
  assert(!hash.includes('securepassword'), 'plaintext leaked into hash!');
  assert.strictEqual(await bcrypt.compare('securepassword', hash), true, 'valid password failed to verify');
  assert.notStrictEqual(await bcrypt.compare('wrongpassword', hash), true, 'WRONG password verified!');

  const fakeUser = {
    password: hash,
    comparePassword(candidate) { return bcrypt.compare(candidate, this.password); },
  };
  assert.strictEqual(await fakeUser.comparePassword('securepassword'), true, 'model comparePassword failed');
  assert.notStrictEqual(await fakeUser.comparePassword('nope'), true, 'wrong password accepted by comparePassword');

  /* --- JWT sign / verify --- */
  const userId = '64b111111111111111111111';
  const token = generateToken(userId);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.strictEqual(decoded.id, userId, 'token id round-trip failed');

  /* tampered token must fail */
  let tamperedRejected = false;
  try {
    const corrupted = token.slice(0, -3) + (token.endsWith('aaa') ? 'bbb' : 'aaa');
    jwt.verify(corrupted, process.env.JWT_SECRET);
  } catch { tamperedRejected = true; }
  assert(tamperedRejected, 'tampered token verified — signature check broken!');

  /* expired token must fail with TokenExpiredError */
  const shortLived = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1s' });
  await new Promise((resolve) => setTimeout(resolve, 1300));
  let expiredRejected = false;
  try {
    jwt.verify(shortLived, process.env.JWT_SECRET);
  } catch (err) {
    expiredRejected = err.name === 'TokenExpiredError';
  }
  assert(expiredRejected, 'expired token did not raise TokenExpiredError');

  console.log('AUTH SELF-TEST PASSED — bcrypt hash/verify, JWT sign/verify, tamper & expiry rejection.');
})().catch((err) => {
  console.error('AUTH SELF-TEST FAILED:', err.message);
  process.exit(1);
});

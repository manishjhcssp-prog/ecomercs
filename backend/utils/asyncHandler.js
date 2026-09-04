/**
 * utils/asyncHandler.js — tiny wrapper so async controller errors propagate
 * to the central error handler instead of crashing or hanging requests.
 */
'use strict';

module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

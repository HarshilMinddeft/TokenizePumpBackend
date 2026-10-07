const express = require('express');
const Controller = require('./Controller');
const Validator = require('./Validator');
const requireAdmin = require('../../middleware/requireAdmin');

const router = express.Router();

// ─── Admin wallet sign-in ─────────────────────────────────────────────────────
// POST /api/auth/admin/nonce   { address }            → { message } to sign
router.post('/admin/nonce', Validator.nonce, Controller.nonce);

// POST /api/auth/admin/verify  { address, signature } → { token, expiresAt }
router.post('/admin/verify', Validator.verify, Controller.verify);

// GET  /api/auth/admin/me      (Bearer token)
router.get('/admin/me', requireAdmin, Controller.me);

// POST /api/auth/admin/logout  (Bearer token)
router.post('/admin/logout', requireAdmin, Controller.logout);

module.exports = router;

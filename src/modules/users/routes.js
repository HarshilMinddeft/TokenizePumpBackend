const express = require('express');
const Controller = require('./Controller');
const Validator = require('./Validator');

const router = express.Router();

// ─── Routes ───────────────────────────────────────────────────────────────────
// POST /api/users/addnewUser
router.post('/addnewUser', Validator.addUser, Controller.addUser);

// GET  /api/users/fetchUser/:refId
router.get('/fetchUser/:refId', Validator.getUserByRefId, Controller.getUserByRefId);

// POST /api/users/blockpass-webhook
router.post('/blockpass-webhook', Validator.blockpassWebhook, Controller.blockpassWebhook);

module.exports = router;

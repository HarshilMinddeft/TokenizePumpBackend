const express = require('express');
const Controller = require('./Controller');
const Validator = require('./Validator');
const requireAdmin = require('../../middleware/requireAdmin');

const router = express.Router();

// ─── Public ───────────────────────────────────────────────────────────────────
// GET /api/rent/status — subgraph sync state, current rent fee, contract addresses
router.get('/status', Controller.status);
// GET /api/rent/streams — the fixed list of income streams and land models
router.get('/streams', Controller.streams);

// ─── Investor (read-only, by wallet) ──────────────────────────────────────────
// GET /api/rent/investor/:address/summary   holdings + rent totals
router.get('/investor/:address/summary', Validator.address, Controller.investorSummary);
// GET /api/rent/investor/:address/payouts   rent history (?page, ?limit)
router.get('/investor/:address/payouts', Validator.address, Controller.investorPayouts);
// GET /api/rent/investor/:address/activity  buys, sells, transfers (?page, ?limit)
router.get('/investor/:address/activity', Validator.address, Controller.investorActivity);

// ─── Admin (wallet-signature session) ─────────────────────────────────────────
const admin = express.Router();
admin.use(requireAdmin);

// GET    /api/rent/admin/overview
admin.get('/overview', Controller.overview);
// GET    /api/rent/admin/assets
admin.get('/assets', Controller.assets);
// GET    /api/rent/admin/assets/:tokenId/holders
admin.get('/assets/:tokenId/holders', Validator.tokenId, Controller.holders);

// GET    /api/rent/admin/assets/:tokenId/streams   settings + change log
admin.get('/assets/:tokenId/streams', Validator.tokenId, Controller.assetStreams);
// PUT    /api/rent/admin/assets/:tokenId/streams   { landModel, incomeStreams, note? }
admin.put('/assets/:tokenId/streams', Validator.tokenId, Validator.updateStreams, Controller.updateAssetStreams);

// POST   /api/rent/admin/distributions   { tokenId, month, streams: { KEY: amount }, excludeIssuer?, note? }
admin.post('/distributions', Validator.createDistribution, Controller.createDistribution);
// GET    /api/rent/admin/distributions   (?tokenId, ?status, ?page, ?limit)
admin.get('/distributions', Controller.listDistributions);
// GET    /api/rent/admin/distributions/:id
admin.get('/distributions/:id', Validator.distributionId, Controller.getDistribution);
// POST   /api/rent/admin/distributions/:id/batches/:batchIndex/submit   { txHash }
admin.post(
  '/distributions/:id/batches/:batchIndex/submit',
  Validator.distributionId,
  Validator.submitBatch,
  Controller.submitBatch,
);
// POST   /api/rent/admin/distributions/:id/sync
admin.post('/distributions/:id/sync', Validator.distributionId, Controller.syncDistribution);
// DELETE /api/rent/admin/distributions/:id   (cancel a draft)
admin.delete('/distributions/:id', Validator.distributionId, Controller.cancelDistribution);

router.use('/admin', admin);

module.exports = router;

const express = require('express');
const multer = require('multer');
const Controller = require('./Controller');
const Validator = require('./Validator');

const router = express.Router();

// ─── Multer Setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// ─── Routes ───────────────────────────────────────────────────────────────────
// POST /api/assets/nftUpload
router.post('/nftUpload', upload.single('file'), Validator.nftUpload, Controller.nftUpload);

// POST /api/assets/metadataUpload
router.post('/metadataUpload', Controller.uploadMetadata);

// POST /api/assets/addAsset
router.post('/addAsset', Validator.addAsset, Controller.addAsset);

// GET  /api/assets/getOwnerAsset?ownerAddress=0x...
router.get('/getOwnerAsset', Validator.getAssetsByOwner, Controller.getAssetsByOwner);

// GET  /api/assets/marketPlace/getAllAssetsSummary
router.get('/marketPlace/getAllAssetsSummary', Controller.getAllAssetsSummary);

// GET  /api/assets/marketPlace/getAssetById/:id
router.get('/marketPlace/getAssetById/:id', Validator.getAssetById, Controller.getAssetById);

module.exports = router;

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
// POST /api/properties/nftUpload
router.post('/nftUpload', upload.single('file'), Validator.nftUpload, Controller.nftUpload);

// POST /api/properties/metadataUpload
router.post('/metadataUpload', Controller.uploadMetadata);

// POST /api/properties/addProperty
router.post('/addProperty', Validator.addProperty, Controller.addProperty);

// GET  /api/properties/getOwnerProperty?ownerAddress=0x...
router.get('/getOwnerProperty', Validator.getPropertiesByOwner, Controller.getPropertiesByOwner);

// GET  /api/properties/marketPlace/getAllPropertiesSummary
router.get('/marketPlace/getAllPropertiesSummary', Controller.getAllPropertiesSummary);

// GET  /api/properties/marketPlace/getPropertyById/:id
router.get('/marketPlace/getPropertyById/:id', Validator.getPropertyById, Controller.getPropertyById);

module.exports = router;

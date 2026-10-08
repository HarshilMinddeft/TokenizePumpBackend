const mongoose = require('mongoose');
const { STREAM_KEYS, LAND_MODELS } = require('../config/incomeStreams');

// Audit trail for an asset's income-stream settings. Changing which streams
// are shared changes what holders earn, so every edit is kept: who made it,
// when, what it was before and after.

const settings = {
  landModel: { type: String, enum: LAND_MODELS, required: true },
  incomeStreams: { type: [{ type: String, enum: STREAM_KEYS }], default: [] },
};

const assetStreamChangeSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true, index: true },
    changedBy: { type: String, required: true, lowercase: true }, // admin wallet
    before: { type: new mongoose.Schema(settings, { _id: false }), required: true },
    after: { type: new mongoose.Schema(settings, { _id: false }), required: true },
    note: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

assetStreamChangeSchema.index({ tokenId: 1, createdAt: -1 });

module.exports = mongoose.model('AssetStreamChange', assetStreamChangeSchema);

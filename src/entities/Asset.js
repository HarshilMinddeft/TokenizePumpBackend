const mongoose = require('mongoose');
const { STREAM_KEYS, LAND_MODELS } = require('../config/incomeStreams');

const assetSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      required: true,
      unique: true,
    },
    assetName: {
      type: String,
      required: true,
    },
    assetPrice: {
      type: Number,
      required: true,
    },
    assetSize: {
      type: Number,
      required: true,
    },
    assetOwnerWallet: {
      type: String,
      required: true,
      lowercase: true,
    },
    assetFeatures: {
      type: String,
      required: true,
    },
    offeringDetails: {
      type: String,
      required: true,
    },
    assetDetails: {
      type: String,
      required: true,
    },
    assetManagement: {
      type: String,
      required: true,
    },
    locationDetails: {
      type: String,
      required: true,
    },
    assetDocuments: {
      type: [String],
      required: true,
    },
    assetImages: {
      type: [String],
      required: true,
    },
    assetThumbImages: {
      type: [String],
      required: true,
    },
    complianceAddress: {
      type: String,
      required: true,
    },
    // How the land reaches holders: leased (land rent is an income stream) or
    // owned by the fuel owner (no rent — holders gain from appreciation).
    landModel: {
      type: String,
      enum: LAND_MODELS,
      default: 'RENT',
    },
    // Income streams the owner shares with token holders each month. Any
    // stream not listed is fixed at 0 — see modules/rent/streams.js.
    incomeStreams: {
      type: [{ type: String, enum: STREAM_KEYS }],
      default: ['FUEL_INCOME'],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('3643Asset', assetSchema);

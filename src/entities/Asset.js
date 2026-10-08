const mongoose = require('mongoose');

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
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('3643Asset', assetSchema);

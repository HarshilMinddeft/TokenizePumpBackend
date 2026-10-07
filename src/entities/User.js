const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    refId: {
      type: String,
      required: true,
      unique: true,
    },
    userWalletAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    // The user's OnchainID IdentityProxy, created via IdFactory once KYC is
    // approved. Absent until the Blockpass webhook completes.
    identityAddress: {
      type: String,
      lowercase: true,
      default: null,
    },
    kycActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);

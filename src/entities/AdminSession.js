const mongoose = require('mongoose');

/**
 * Admin wallet sign-in. A NONCE row holds the one-time message the wallet
 * must sign; verifying it replaces it with a SESSION row. Only a SHA-256 of
 * the session token is stored, so a database leak doesn't hand out sessions.
 */
const adminSessionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['NONCE', 'SESSION'], required: true },
    address: { type: String, required: true, lowercase: true, index: true },
    message: { type: String, default: null },
    tokenHash: { type: String, default: null, index: { unique: true, sparse: true } },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo removes expired rows on its own (checked roughly once a minute), so
// lookups must still compare expiresAt themselves.
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AdminSession', adminSessionSchema);

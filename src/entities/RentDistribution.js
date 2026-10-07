const mongoose = require('mongoose');

// Money fields are stablecoin base units stored as decimal strings — they are
// BigInt in the calculator and exceed Number's safe range at scale.

const rentDistributionSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true, index: true },
    propertyName: { type: String, default: null },
    shareToken: { type: String, required: true, lowercase: true },
    issuer: { type: String, required: true, lowercase: true },
    totalShares: { type: String, required: true },

    month: { type: String, required: true }, // 'YYYY-MM'
    periodStart: { type: Date, required: true },
    // Equals the month end, except a testnet-only partial month
    // (RENT_ALLOW_CURRENT_MONTH), which ends at the subgraph's indexed block.
    periodEnd: { type: Date, required: true },
    monthEnd: { type: Date, required: true },
    // Subgraph block the ledger was read at, for audit.
    indexedBlock: { type: Number, required: true },

    rent: { type: String, required: true },
    feeBps: { type: Number, required: true },
    feeVersion: { type: String, required: true },
    grossPaid: { type: String, required: true },
    fee: { type: String, required: true },
    netPaid: { type: String, required: true },
    selfKept: { type: String, required: true },
    excludedIssuer: { type: String, required: true },
    unallocated: { type: String, required: true },

    excludeIssuer: { type: Boolean, required: true },
    // The admin wallet this draft was prepared for: its own share is kept
    // rather than transferred, so only this wallet may sign the batches.
    payerWallet: { type: String, required: true, lowercase: true },
    stablecoin: { type: String, required: true, lowercase: true },
    rentDistributor: { type: String, required: true, lowercase: true },

    status: {
      type: String,
      enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },
    // `${tokenId}:${month}` while not cancelled; unset on cancel. The unique
    // sparse index makes "one live distribution per property per month" a
    // database guarantee rather than a race-prone check.
    activeKey: { type: String, default: undefined },

    holderCount: { type: Number, required: true },
    payableCount: { type: Number, required: true },
    batchCount: { type: Number, required: true },
    note: { type: String, default: '' },
    createdBy: { type: String, required: true, lowercase: true },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

rentDistributionSchema.index({ activeKey: 1 }, { unique: true, sparse: true });
rentDistributionSchema.index({ tokenId: 1, month: -1 });

module.exports = mongoose.model('RentDistribution', rentDistributionSchema);

const mongoose = require('mongoose');

/**
 * One holder's share of one RentDistribution, frozen as the admin reviewed
 * it. Amounts are stablecoin base units as decimal strings.
 *
 *   tokenSeconds  Σ balance × seconds held in the period — the rent weight:
 *                 grossAmount = rent × tokenSeconds / (totalShares × monthSeconds)
 *   heldSeconds   seconds the balance was above zero; shown as daysHeld
 *   averageBalance      tokenSeconds / period seconds (whole period)
 *   averageHeldBalance  tokenSeconds / heldSeconds (only while holding)
 *   sharePercent  tokenSeconds as a % of the whole month's token-seconds
 */
const rentAllocationSchema = new mongoose.Schema(
  {
    distribution: { type: mongoose.Schema.Types.ObjectId, ref: 'RentDistribution', required: true, index: true },
    tokenId: { type: String, required: true },
    month: { type: String, required: true },
    holder: { type: String, required: true, lowercase: true },

    openingBalance: { type: String, required: true },
    closingBalance: { type: String, required: true },
    tokenSeconds: { type: String, required: true },
    heldSeconds: { type: Number, required: true },
    daysHeld: { type: String, required: true },
    averageBalance: { type: String, required: true },
    // Absent on drafts created before this field existed; derive it as
    // tokenSeconds / heldSeconds.
    averageHeldBalance: { type: String, default: null },
    sharePercent: { type: String, required: true },

    grossAmount: { type: String, required: true },
    feeAmount: { type: String, required: true },
    netAmount: { type: String, required: true },

    // PAYABLE until its batch is paid (then PAID); the others are final.
    status: {
      type: String,
      enum: ['PAYABLE', 'PAID', 'SELF_KEPT', 'EXCLUDED_ISSUER', 'ZERO'],
      required: true,
    },
    batchIndex: { type: Number, default: null },
    txHash: { type: String, default: null, lowercase: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

rentAllocationSchema.index({ distribution: 1, holder: 1 }, { unique: true });
rentAllocationSchema.index({ holder: 1, month: -1 });

module.exports = mongoose.model('RentAllocation', rentAllocationSchema);

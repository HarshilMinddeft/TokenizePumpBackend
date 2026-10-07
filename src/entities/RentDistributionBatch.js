const mongoose = require('mongoose');

/** One RentDistributor.distribute() call within a RentDistribution. */
const rentDistributionBatchSchema = new mongoose.Schema(
  {
    distribution: { type: mongoose.Schema.Types.ObjectId, ref: 'RentDistribution', required: true, index: true },
    batchIndex: { type: Number, required: true },
    // bytes32 passed on-chain; keccak256(distributionId, batchIndex). The
    // contract executes each batchId once, so a batch can never pay twice.
    batchId: { type: String, required: true, unique: true, lowercase: true },
    recipientCount: { type: Number, required: true },
    amount: { type: String, required: true },
    platformFee: { type: String, required: true },

    // PENDING → SUBMITTED (tx sent from the admin's wallet) → PAID (seen in
    // the subgraph). FAILED when the tx reverted; the batch can be resent
    // under the same batchId because it never executed.
    status: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'PAID', 'FAILED'],
      default: 'PENDING',
    },
    txHash: { type: String, default: null, lowercase: true },
    submittedBy: { type: String, default: null, lowercase: true },
    submittedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    blockNumber: { type: Number, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

rentDistributionBatchSchema.index({ distribution: 1, batchIndex: 1 }, { unique: true });

module.exports = mongoose.model('RentDistributionBatch', rentDistributionBatchSchema);

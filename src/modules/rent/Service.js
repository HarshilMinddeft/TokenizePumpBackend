const { ethers } = require('ethers');
const Property = require('../../entities/Property');
const RentDistribution = require('../../entities/RentDistribution');
const RentAllocation = require('../../entities/RentAllocation');
const RentDistributionBatch = require('../../entities/RentDistributionBatch');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const subgraph = require('../../utils/subgraph.util');
const chain = require('../../utils/contracts.util');
const { readProvider: provider } = require('../../utils/ethers.util');
const calc = require('./calculator');

// ─── Subgraph queries ─────────────────────────────────────────────────────────

const PROPERTY_FIELDS = `
  id tokenId shareToken issuer totalShares currentSupply holderCount
  listingOwner listingActive listingRemaining pricePerToken
  buyBackActive redeemed fractionalizedAt totalRentDistributed totalRentFees
`;

const Q = {
  property: `query($id: ID!) { property(id: $id) { ${PROPERTY_FIELDS} } }`,
  properties: `{ properties(first: 1000, orderBy: fractionalizedAt, orderDirection: desc) { ${PROPERTY_FIELDS} } }`,
  // Paged by holder id (Bytes), since holdings have no ordinal.
  holdings: `query($property: String!, $first: Int!, $after: Bytes!) {
    holdings(first: $first, orderBy: id, orderDirection: asc,
      where: { property: $property, balance_gt: "0", id_gt: $after }) {
      id holder balance firstAcquiredAt rentReceived
    }
  }`,
  ledger: `query($property: String!, $before: BigInt!, $first: Int!, $after: BigInt!) {
    balanceChanges(first: $first, orderBy: ordinal, orderDirection: asc,
      where: { property: $property, timestamp_lt: $before, ordinal_gt: $after }) {
      holder delta timestamp ordinal
    }
  }`,
  rentBatches: `query($ids: [Bytes!]!) {
    rentBatches(where: { id_in: $ids }) { id txHash blockNumber timestamp }
  }`,
  investorHoldings: `query($holder: Bytes!) {
    holdings(first: 1000, where: { holder: $holder }) {
      balance firstAcquiredAt rentReceived
      property { ${PROPERTY_FIELDS} }
    }
  }`,
  investorActivity: `query($who: Bytes!, $first: Int!, $skip: Int!) {
    activities(first: $first, skip: $skip, orderBy: ordinal, orderDirection: desc,
      where: { or: [{ from: $who }, { to: $who }] }) {
      id type from to amount pricePerToken totalValue fee orderId timestamp txHash
      property { id }
    }
  }`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const lower = (a) => a.toLowerCase();
const toIso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString();

/** keccak256(distributionId, batchIndex) — the bytes32 batchId used on-chain. */
const batchIdFor = (distributionId, batchIndex) =>
  ethers.solidityPackedKeccak256(['string', 'uint256'], [distributionId.toString(), batchIndex]).toLowerCase();

async function fetchProperty(tokenId) {
  const { property } = await subgraph.query(Q.property, { id: String(tokenId) });
  if (!property) throw new AppError(`Property ${tokenId} is not fractionalized`, 404);
  return property;
}

async function fetchHoldings(tokenId) {
  const rows = [];
  let after = '0x';
  for (;;) {
    const { holdings } = await subgraph.query(Q.holdings, {
      property: String(tokenId),
      first: subgraph.PAGE_SIZE,
      after,
    });
    rows.push(...holdings);
    if (holdings.length < subgraph.PAGE_SIZE) return rows;
    after = holdings[holdings.length - 1].id;
  }
}

/** propertyId → { propertyName, thumbnail } from the backend's Property collection. */
async function propertyNames(tokenIds) {
  const docs = await Property.find(
    { propertyId: { $in: tokenIds.map(String) } },
    { propertyId: 1, propertyName: 1, propertyThumbImages: 1 },
  ).lean();
  return new Map(
    docs.map((d) => [d.propertyId, { propertyName: d.propertyName, thumbnail: d.propertyThumbImages?.[0] ?? null }]),
  );
}

/**
 * Holdings must add up on both sides before rent is computed from them:
 * Σ subgraph holdings == subgraph currentSupply == on-chain totalSupply,
 * all at the subgraph's indexed block.
 */
async function checkSupply(property, indexedBlockNumber) {
  const holdings = await fetchHoldings(property.id);
  const sum = holdings.reduce((a, h) => a + BigInt(h.balance), 0n);
  const onChain = await chain.erc20(property.shareToken).totalSupply({ blockTag: indexedBlockNumber });
  const indexed = BigInt(property.currentSupply);

  if (sum !== indexed || indexed !== onChain) {
    throw new AppError(
      `Holdings don't reconcile for property ${property.id}: holdings sum ${sum}, ` +
        `indexed supply ${indexed}, on-chain supply ${onChain}. Not safe to distribute.`,
      409,
    );
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

class Service {
  /** Subgraph sync state + current fee — public. */
  async getStatus() {
    const [indexed, fee, stablecoin] = await Promise.all([
      subgraph.getIndexedBlock(),
      chain.getRentFee(),
      chain.getStablecoinMeta(),
    ]);
    return {
      subgraph: { ...indexed, indexedAt: toIso(indexed.timestamp), lagSeconds: Math.floor(Date.now() / 1000) - indexed.timestamp },
      fee,
      stablecoin,
      rentDistributor: env.RENT_DISTRIBUTOR_ADDRESS?.toLowerCase() ?? null,
      allowCurrentMonth: env.RENT_ALLOW_CURRENT_MONTH,
    };
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  async getOverview(adminAddress) {
    const status = await this.getStatus();
    const distributor = status.rentDistributor;
    const token = chain.stablecoin();

    const [canSign, balance, allowance, gasBalance, maxBatchSize, counts] = await Promise.all([
      chain.canDistribute(adminAddress),
      token.balanceOf(adminAddress),
      token.allowance(adminAddress, distributor),
      provider.getBalance(adminAddress),
      chain.getMaxBatchSize(),
      RentDistribution.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const completed = await RentDistribution.find({ status: 'COMPLETED' }, { netPaid: 1, fee: 1 }).lean();
    const sum = (field) => completed.reduce((a, d) => a + BigInt(d[field]), 0n).toString();

    return {
      ...status,
      maxBatchSize,
      admin: {
        address: adminAddress,
        canSign,
        stablecoinBalance: balance.toString(),
        allowance: allowance.toString(),
        nativeBalance: gasBalance.toString(),
      },
      distributions: {
        byStatus: Object.fromEntries(counts.map((c) => [c._id, c.count])),
        totalNetPaid: sum('netPaid'),
        totalFees: sum('fee'),
      },
    };
  }

  async listProperties() {
    const { properties } = await subgraph.query(Q.properties);
    const names = await propertyNames(properties.map((p) => p.id));
    const lastMonths = await RentDistribution.aggregate([
      { $match: { status: { $ne: 'CANCELLED' } } },
      { $group: { _id: '$tokenId', lastMonth: { $max: '$month' }, count: { $sum: 1 } } },
    ]);
    const last = new Map(lastMonths.map((r) => [r._id, r]));

    return properties.map((p) => ({
      ...p,
      ...(names.get(p.id) ?? { propertyName: null, thumbnail: null }),
      lastDistributedMonth: last.get(p.id)?.lastMonth ?? null,
      distributionCount: last.get(p.id)?.count ?? 0,
    }));
  }

  async getHolders(tokenId) {
    const property = await fetchProperty(tokenId);
    const holdings = await fetchHoldings(tokenId);
    holdings.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
    const names = await propertyNames([tokenId]);
    return { property: { ...property, ...(names.get(property.id) ?? {}) }, holders: holdings };
  }

  /**
   * Computes a month's rent split and saves it as a DRAFT for the admin to
   * review and sign. See calculator.js for the model.
   */
  async createDistribution({ tokenId, month, rent, excludeIssuer = false, note = '' }, adminAddress) {
    const admin = lower(adminAddress);
    const tokenKey = String(tokenId);

    let bounds;
    try {
      bounds = calc.monthBounds(month);
    } catch (err) {
      throw new AppError(err.message, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    if (bounds.start > now) throw new AppError(`${month} hasn't started yet`, 400);

    const indexed = await subgraph.getIndexedBlock();
    if (indexed.hasIndexingErrors) throw new AppError('The subgraph has indexing errors — fix it before distributing', 503);

    let periodEnd = bounds.end;
    if (bounds.end > now) {
      if (!env.RENT_ALLOW_CURRENT_MONTH) {
        throw new AppError(
          `${month} hasn't ended yet — its rent can be distributed from ${toIso(bounds.end).slice(0, 10)}`,
          400,
        );
      }
      periodEnd = indexed.timestamp; // testnet-only partial month
    } else if (indexed.timestamp < bounds.end) {
      throw new AppError(
        `The subgraph is still syncing (indexed to ${toIso(indexed.timestamp)}); ` +
          `it must pass the end of ${month} first. Try again shortly.`,
        409,
      );
    }
    if (periodEnd <= bounds.start) throw new AppError('Nothing indexed for this month yet', 409);

    const property = await fetchProperty(tokenKey);
    if (Number(property.fractionalizedAt) >= periodEnd) {
      throw new AppError(`Property ${tokenKey} had no shares during ${month}`, 400);
    }

    const activeKey = `${tokenKey}:${month}`;
    const existing = await RentDistribution.findOne({ activeKey }, { _id: 1, status: 1 }).lean();
    if (existing) {
      throw new AppError(
        `Rent for property ${tokenKey} in ${month} already has a ${existing.status} distribution (${existing._id}). ` +
          'Cancel that draft first to redo it.',
        409,
      );
    }

    await checkSupply(property, indexed.number);

    const [fee, stable, maxBatchSize] = await Promise.all([
      chain.getRentFee(),
      chain.getStablecoinMeta(),
      chain.getMaxBatchSize(),
    ]);

    let rentUnits;
    try {
      rentUnits = ethers.parseUnits(String(rent), stable.decimals);
    } catch {
      throw new AppError(`rent must be a number with at most ${stable.decimals} decimals`, 400);
    }
    if (rentUnits <= 0n) throw new AppError('rent must be greater than 0', 400);

    const ledger = await subgraph.queryAllByOrdinal(Q.ledger, 'balanceChanges', {
      property: tokenKey,
      before: String(periodEnd),
    });

    let result;
    try {
      result = calc.computeRentAllocation({
        changes: ledger.map((c) => ({ holder: c.holder, delta: BigInt(c.delta), timestamp: Number(c.timestamp) })),
        monthStart: bounds.start,
        monthEnd: bounds.end,
        periodEnd,
        totalShares: BigInt(property.totalShares),
        rent: rentUnits,
        feeBps: BigInt(fee.feeBps),
        issuer: lower(property.issuer),
        excludeIssuer: Boolean(excludeIssuer),
        selfWallet: admin,
      });
    } catch (err) {
      throw new AppError(`Rent calculation failed: ${err.message}`, 409);
    }

    const payable = result.allocations.filter((a) => a.status === calc.Status.PAYABLE);
    if (payable.length === 0) {
      throw new AppError('Nobody is payable for this month with these settings — nothing to distribute', 400);
    }
    const batches = calc.buildBatches(result.allocations, result.totals.fee, maxBatchSize);
    const names = await propertyNames([tokenKey]);

    let distribution;
    try {
      distribution = await RentDistribution.create({
        tokenId: tokenKey,
        propertyName: names.get(tokenKey)?.propertyName ?? null,
        shareToken: property.shareToken,
        issuer: property.issuer,
        totalShares: property.totalShares,
        month,
        periodStart: new Date(bounds.start * 1000),
        periodEnd: new Date(periodEnd * 1000),
        monthEnd: new Date(bounds.end * 1000),
        indexedBlock: indexed.number,
        rent: rentUnits.toString(),
        feeBps: fee.feeBps,
        feeVersion: fee.feeVersion,
        grossPaid: result.totals.grossPaid.toString(),
        fee: result.totals.fee.toString(),
        netPaid: result.totals.netPaid.toString(),
        selfKept: result.totals.selfKept.toString(),
        excludedIssuer: result.totals.excludedIssuer.toString(),
        unallocated: result.totals.unallocated.toString(),
        excludeIssuer: Boolean(excludeIssuer),
        payerWallet: admin,
        stablecoin: stable.address,
        rentDistributor: env.RENT_DISTRIBUTOR_ADDRESS,
        activeKey,
        holderCount: result.allocations.length,
        payableCount: payable.length,
        batchCount: batches.length,
        note,
        createdBy: admin,
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw new AppError(`Rent for property ${tokenKey} in ${month} was just created by another request`, 409);
      }
      throw err;
    }

    try {
      const batchOf = new Map();
      batches.forEach((b) => b.holders.forEach((h) => batchOf.set(h, b.batchIndex)));

      await RentAllocation.insertMany(
        result.allocations.map((a) => ({
          distribution: distribution._id,
          tokenId: tokenKey,
          month,
          holder: a.holder,
          openingBalance: a.openingBalance.toString(),
          closingBalance: a.closingBalance.toString(),
          tokenSeconds: a.tokenSeconds.toString(),
          heldSeconds: a.heldSeconds,
          daysHeld: a.daysHeld,
          averageBalance: a.averageBalance,
          averageHeldBalance: a.averageHeldBalance,
          sharePercent: a.sharePercent,
          grossAmount: a.grossAmount.toString(),
          feeAmount: a.feeAmount.toString(),
          netAmount: a.netAmount.toString(),
          status: a.status,
          batchIndex: batchOf.get(a.holder) ?? null,
        })),
      );
      await RentDistributionBatch.insertMany(
        batches.map((b) => ({
          distribution: distribution._id,
          batchIndex: b.batchIndex,
          batchId: batchIdFor(distribution._id, b.batchIndex),
          recipientCount: b.holders.length,
          amount: b.amount.toString(),
          platformFee: b.platformFee.toString(),
        })),
      );
    } catch (err) {
      // Roll back so the month isn't left reserved by a half-written draft.
      await Promise.all([
        RentAllocation.deleteMany({ distribution: distribution._id }),
        RentDistributionBatch.deleteMany({ distribution: distribution._id }),
        RentDistribution.deleteOne({ _id: distribution._id }),
      ]);
      throw err;
    }

    return this.getDistribution(distribution._id);
  }

  async listDistributions({ tokenId, status, page = 1, limit = 20 }) {
    const filter = {};
    if (tokenId) filter.tokenId = String(tokenId);
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      RentDistribution.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RentDistribution.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  /**
   * A distribution with its allocations and batches. Each batch carries the
   * exact `distribute` arguments for the admin's wallet to sign.
   */
  async getDistribution(id) {
    const distribution = await RentDistribution.findById(id).lean();
    if (!distribution) throw new AppError('Distribution not found', 404);

    const [allocations, batches, stable] = await Promise.all([
      RentAllocation.find({ distribution: distribution._id }).lean(),
      RentDistributionBatch.find({ distribution: distribution._id }).sort({ batchIndex: 1 }).lean(),
      chain.getStablecoinMeta(),
    ]);
    allocations.sort((a, b) => (BigInt(b.grossAmount) > BigInt(a.grossAmount) ? 1 : -1));

    const withCall = batches.map((batch) => {
      const rows = allocations.filter((a) => a.batchIndex === batch.batchIndex);
      return {
        ...batch,
        call: {
          contract: distribution.rentDistributor,
          method: 'distribute',
          args: {
            batchId: batch.batchId,
            tokenId: distribution.tokenId,
            recipients: rows.map((r) => r.holder),
            amounts: rows.map((r) => r.netAmount),
            platformFee: batch.platformFee,
          },
          // What this batch pulls from the signer; the approval must cover it.
          total: (BigInt(batch.amount) + BigInt(batch.platformFee)).toString(),
        },
      };
    });

    return { distribution, allocations, batches: withCall, stablecoin: stable };
  }

  /** The admin's wallet sent a batch; record the tx and check it right away. */
  async markBatchSubmitted(id, batchIndex, txHash, adminAddress) {
    const distribution = await RentDistribution.findById(id).lean();
    if (!distribution) throw new AppError('Distribution not found', 404);
    if (distribution.status === 'CANCELLED' || distribution.status === 'COMPLETED') {
      throw new AppError(`Distribution is ${distribution.status}`, 409);
    }
    if (lower(adminAddress) !== distribution.payerWallet) {
      throw new AppError(
        `This draft was prepared for ${distribution.payerWallet} (its own share is kept, not paid). ` +
          'Only that wallet can sign it.',
        403,
      );
    }

    const batch = await RentDistributionBatch.findOneAndUpdate(
      { distribution: distribution._id, batchIndex, status: { $in: ['PENDING', 'FAILED'] } },
      {
        status: 'SUBMITTED',
        txHash: lower(txHash),
        submittedBy: lower(adminAddress),
        submittedAt: new Date(),
        error: null,
      },
      { new: true },
    );
    if (!batch) throw new AppError(`Batch ${batchIndex} is not awaiting submission`, 409);

    await RentDistribution.updateOne({ _id: distribution._id, status: 'DRAFT' }, { status: 'IN_PROGRESS' });
    return this.syncDistribution(id);
  }

  /**
   * Reconciles batches with the chain. A batch is PAID once the subgraph has
   * its RentDistributed event or its tx receipt shows it; a reverted tx marks
   * it FAILED so it can be resent (it never executed, so the same batchId is
   * still valid).
   */
  async syncDistribution(id) {
    const distribution = await RentDistribution.findById(id).lean();
    if (!distribution) throw new AppError('Distribution not found', 404);
    if (distribution.status === 'CANCELLED') return this.getDistribution(id);

    const open = await RentDistributionBatch.find({ distribution: distribution._id, status: { $ne: 'PAID' } }).lean();
    if (open.length > 0) {
      const { rentBatches } = await subgraph.query(Q.rentBatches, { ids: open.map((b) => b.batchId) });
      const indexed = new Map(rentBatches.map((b) => [b.id.toLowerCase(), b]));

      for (const batch of open) {
        const seen = indexed.get(batch.batchId);
        let update = null;

        if (seen) {
          update = { status: 'PAID', txHash: seen.txHash, blockNumber: Number(seen.blockNumber), paidAt: new Date(Number(seen.timestamp) * 1000) };
        } else if (batch.status === 'SUBMITTED' && batch.txHash) {
          const outcome = await chain.getBatchTxOutcome(batch.txHash, batch.batchId);
          if (outcome.state === 'PAID') {
            update = { status: 'PAID', blockNumber: outcome.blockNumber, paidAt: new Date() };
          } else if (outcome.state === 'FAILED') {
            update = { status: 'FAILED', error: 'Transaction reverted or did not pay this batch — resend it' };
          }
        }
        if (!update) continue;

        await RentDistributionBatch.updateOne({ _id: batch._id }, update);
        if (update.status === 'PAID') {
          await RentAllocation.updateMany(
            { distribution: distribution._id, batchIndex: batch.batchIndex, status: 'PAYABLE' },
            { status: 'PAID', txHash: update.txHash ?? batch.txHash, paidAt: update.paidAt },
          );
        }
      }
    }

    const unpaid = await RentDistributionBatch.countDocuments({ distribution: distribution._id, status: { $ne: 'PAID' } });
    if (unpaid === 0) {
      await RentDistribution.updateOne(
        { _id: distribution._id, status: { $ne: 'COMPLETED' } },
        { status: 'COMPLETED', completedAt: new Date() },
      );
    } else {
      const started = await RentDistributionBatch.exists({ distribution: distribution._id, status: { $ne: 'PENDING' } });
      if (started) await RentDistribution.updateOne({ _id: distribution._id, status: 'DRAFT' }, { status: 'IN_PROGRESS' });
    }

    return this.getDistribution(id);
  }

  /** Cancels a draft. Refused once any batch has been sent. */
  async cancelDistribution(id) {
    const distribution = await RentDistribution.findById(id).lean();
    if (!distribution) throw new AppError('Distribution not found', 404);
    if (distribution.status === 'CANCELLED') return this.getDistribution(id);

    const sent = await RentDistributionBatch.exists({
      distribution: distribution._id,
      status: { $in: ['SUBMITTED', 'PAID'] },
    });
    if (sent) throw new AppError('A batch has already been sent — this distribution can no longer be cancelled', 409);

    await RentDistribution.updateOne(
      { _id: distribution._id },
      { status: 'CANCELLED', cancelledAt: new Date(), $unset: { activeKey: 1 } },
    );
    return this.getDistribution(id);
  }

  // ── Investor ────────────────────────────────────────────────────────────────

  async getInvestorSummary(address) {
    const holder = lower(address);
    const { holdings } = await subgraph.query(Q.investorHoldings, { holder });
    const names = await propertyNames(holdings.map((h) => h.property.id));

    const [pending, lastPaid] = await Promise.all([
      RentAllocation.aggregate([
        { $match: { holder, status: 'PAYABLE' } },
        { $lookup: { from: 'rentdistributions', localField: 'distribution', foreignField: '_id', as: 'd' } },
        { $match: { 'd.status': { $ne: 'CANCELLED' } } },
        { $project: { netAmount: 1 } },
      ]),
      RentAllocation.findOne({ holder, status: 'PAID' }).sort({ paidAt: -1 }).lean(),
    ]);

    const rentReceived = holdings.reduce((a, h) => a + BigInt(h.rentReceived), 0n);
    const pendingRent = pending.reduce((a, p) => a + BigInt(p.netAmount), 0n);

    return {
      address: holder,
      stablecoin: await chain.getStablecoinMeta(),
      totals: {
        propertiesHeld: holdings.filter((h) => BigInt(h.balance) > 0n).length,
        sharesHeld: holdings.reduce((a, h) => a + BigInt(h.balance), 0n).toString(),
        rentReceived: rentReceived.toString(),
        pendingRent: pendingRent.toString(),
        lastPayoutAt: lastPaid?.paidAt ?? null,
        lastPayoutAmount: lastPaid?.netAmount ?? null,
      },
      // Includes properties fully sold but that paid this wallet rent before.
      holdings: holdings
        .filter((h) => BigInt(h.balance) > 0n || BigInt(h.rentReceived) > 0n)
        .map((h) => ({
          tokenId: h.property.id,
          ...(names.get(h.property.id) ?? { propertyName: null, thumbnail: null }),
          balance: h.balance,
          totalShares: h.property.totalShares,
          ownershipPercent: h.property.totalShares === '0'
            ? '0'
            : ((Number(h.balance) / Number(h.property.totalShares)) * 100).toFixed(4),
          pricePerToken: h.property.pricePerToken,
          firstAcquiredAt: h.firstAcquiredAt,
          rentReceived: h.rentReceived,
        })),
    };
  }

  async getInvestorPayouts(address, { page = 1, limit = 20 }) {
    const holder = lower(address);
    const [result] = await RentAllocation.aggregate([
      { $match: { holder, status: { $in: ['PAYABLE', 'PAID', 'SELF_KEPT'] } } },
      { $lookup: { from: 'rentdistributions', localField: 'distribution', foreignField: '_id', as: 'd' } },
      { $unwind: '$d' },
      { $match: { 'd.status': { $ne: 'CANCELLED' } } },
      { $sort: { month: -1, tokenId: 1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                distributionId: '$d._id',
                tokenId: 1,
                propertyName: '$d.propertyName',
                month: 1,
                daysHeld: 1,
                averageBalance: 1,
                averageHeldBalance: 1,
                tokenSeconds: 1,
                heldSeconds: 1,
                sharePercent: 1,
                // What the investor dashboard needs to show how each
                // amount was worked out.
                rent: '$d.rent',
                totalShares: '$d.totalShares',
                feeBps: '$d.feeBps',
                periodStart: '$d.periodStart',
                periodEnd: '$d.periodEnd',
                monthEnd: '$d.monthEnd',
                grossAmount: 1,
                feeAmount: 1,
                netAmount: 1,
                status: 1,
                txHash: 1,
                paidAt: 1,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);
    return { items: result.items, total: result.total[0]?.count ?? 0, page, limit };
  }

  async getInvestorActivity(address, { page = 1, limit = 20 }) {
    const who = lower(address);
    const { activities } = await subgraph.query(Q.investorActivity, {
      who,
      first: limit,
      skip: (page - 1) * limit,
    });
    const names = await propertyNames([...new Set(activities.map((a) => a.property.id))]);
    return {
      items: activities.map((a) => ({
        ...a,
        tokenId: a.property.id,
        propertyName: names.get(a.property.id)?.propertyName ?? null,
        direction: a.to === who ? 'IN' : 'OUT',
      })),
      page,
      limit,
    };
  }
}

module.exports = new Service();

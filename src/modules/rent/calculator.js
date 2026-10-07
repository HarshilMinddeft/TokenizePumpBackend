/**
 * Rent allocation — pure functions, no I/O.
 *
 * Model: every share earns a fixed rate for each second it is held.
 *
 *   rate  = rent / (totalShares * secondsInMonth)
 *   gross = rate * tokenSeconds          (tokenSeconds = Σ balance × seconds held)
 *
 * Rent for time nobody held a share — before the property was fractionalized,
 * or after shares were burned (buyback, redemption) — is not paid out; it
 * stays with the admin. So is an excluded issuer's share, and the admin
 * wallet's own share (paying yourself only costs gas).
 *
 * The platform fee is taken only on what is actually paid out:
 *   fee = Σ payable gross * feeBps / 10000          (rounded down)
 *   net = Σ payable gross - fee, split in proportion to gross by largest
 *         remainder, so holders' nets sum to it exactly.
 *
 * All token and money amounts are BigInt (money in stablecoin base units).
 * Timestamps are unix seconds (numbers).
 */

const BPS_DENOMINATOR = 10_000n;
const SECONDS_PER_DAY = 86_400;

const Status = Object.freeze({
  PAYABLE: 'PAYABLE',
  SELF_KEPT: 'SELF_KEPT',
  EXCLUDED_ISSUER: 'EXCLUDED_ISSUER',
  ZERO: 'ZERO',
});

/** UTC bounds of a 'YYYY-MM' month as unix seconds: [start, end). */
function monthBounds(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!match) throw new Error(`Invalid month "${month}" — expected YYYY-MM`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error(`Invalid month "${month}"`);
  const start = Date.UTC(year, monthIndex, 1) / 1000;
  const end = Date.UTC(year, monthIndex + 1, 1) / 1000;
  return { start, end };
}

/**
 * Each holder's balance history inside [periodStart, periodEnd).
 *
 * @param {Array<{holder: string, delta: bigint, timestamp: number}>} changes
 *        Every balance change for the property with timestamp < periodEnd,
 *        in ledger (ordinal) order.
 * @returns {Map<string, {opening: bigint, closing: bigint, tokenSeconds: bigint, heldSeconds: number}>}
 */
function holdingTimeline(changes, periodStart, periodEnd) {
  const holders = new Map();
  const get = (holder) => {
    let h = holders.get(holder);
    if (!h) {
      h = { opening: 0n, balance: 0n, tokenSeconds: 0n, heldSeconds: 0, lastTs: periodStart };
      holders.set(holder, h);
    }
    return h;
  };

  // Accrue a holder's current balance up to `ts`.
  const accrue = (h, ts) => {
    const dt = ts - Math.max(h.lastTs, periodStart);
    if (dt > 0) {
      h.tokenSeconds += h.balance * BigInt(dt);
      if (h.balance > 0n) h.heldSeconds += dt;
    }
    h.lastTs = Math.max(h.lastTs, ts);
  };

  for (const change of changes) {
    if (change.timestamp >= periodEnd) break;
    const h = get(change.holder);

    if (change.timestamp < periodStart) {
      h.balance += change.delta;
      h.opening = h.balance;
    } else {
      accrue(h, change.timestamp);
      h.balance += change.delta;
    }
  }

  for (const [holder, h] of holders) {
    // Transient negatives inside one block are fine (same timestamp, so they
    // accrue nothing); a negative balance that persists is corrupt data.
    if (h.balance < 0n) throw new Error(`Negative balance for ${holder} at period end`);
    accrue(h, periodEnd);
  }

  const result = new Map();
  for (const [holder, h] of holders) {
    result.set(holder, {
      opening: h.opening,
      closing: h.balance,
      tokenSeconds: h.tokenSeconds,
      heldSeconds: h.heldSeconds,
    });
  }
  return result;
}

/**
 * Splits `total` across `weights` in proportion, exactly: floor shares, then
 * one unit each to the largest remainders (ties broken by input order).
 * @param {bigint} total
 * @param {bigint[]} weights
 */
function splitProportionally(total, weights) {
  const sum = weights.reduce((a, w) => a + w, 0n);
  if (sum === 0n) return weights.map(() => 0n);

  const shares = weights.map((w) => (total * w) / sum);
  let leftover = total - shares.reduce((a, s) => a + s, 0n);

  const byRemainder = weights
    .map((w, i) => ({ i, remainder: (total * w) % sum }))
    .sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : a.i - b.i));

  for (let k = 0; leftover > 0n; k++, leftover--) shares[byRemainder[k].i] += 1n;
  return shares;
}

/** a/b as a fixed-point decimal string. */
function ratio(a, b, decimals) {
  if (b === 0n) return '0';
  const scale = 10n ** BigInt(decimals);
  const scaled = (a * scale) / b;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(decimals, '0');
  return decimals ? `${whole}.${frac}` : whole.toString();
}

/**
 * @param {object} p
 * @param {Array<{holder: string, delta: bigint, timestamp: number}>} p.changes
 * @param {number} p.monthStart       unix seconds
 * @param {number} p.monthEnd         unix seconds (exclusive)
 * @param {number} [p.periodEnd]      accrue up to here (defaults to monthEnd;
 *                                    earlier only for a month still in progress)
 * @param {bigint} p.totalShares      shares minted at fractionalization
 * @param {bigint} p.rent             gross monthly rent, stablecoin base units
 * @param {bigint} p.feeBps           FeeManager saleServicerFeeBps
 * @param {string} p.issuer           lowercase address
 * @param {boolean} p.excludeIssuer
 * @param {string} [p.selfWallet]     lowercase address of the paying admin
 */
function computeRentAllocation(p) {
  const periodStart = p.monthStart;
  const periodEnd = p.periodEnd ?? p.monthEnd;
  const monthSeconds = BigInt(p.monthEnd - p.monthStart);
  if (periodEnd <= periodStart || periodEnd > p.monthEnd) throw new Error('Invalid period');
  if (p.totalShares <= 0n) throw new Error('totalShares must be positive');
  if (p.rent <= 0n) throw new Error('rent must be positive');
  if (p.feeBps < 0n || p.feeBps > BPS_DENOMINATOR) throw new Error('feeBps out of range');

  const denominator = p.totalShares * monthSeconds;
  const periodSeconds = BigInt(periodEnd - periodStart);
  const timeline = holdingTimeline(p.changes, periodStart, periodEnd);

  const rows = [];
  for (const [holder, h] of timeline) {
    if (h.tokenSeconds === 0n) continue; // held nothing during the period

    const gross = (p.rent * h.tokenSeconds) / denominator;
    let status = Status.PAYABLE;
    if (p.excludeIssuer && holder === p.issuer) status = Status.EXCLUDED_ISSUER;
    else if (p.selfWallet && holder === p.selfWallet) status = Status.SELF_KEPT;
    else if (gross === 0n) status = Status.ZERO;

    rows.push({
      holder,
      openingBalance: h.opening,
      closingBalance: h.closing,
      tokenSeconds: h.tokenSeconds,
      heldSeconds: h.heldSeconds,
      daysHeld: (h.heldSeconds / SECONDS_PER_DAY).toFixed(2),
      // Over the whole period, including time before the holder bought (or
      // before the property existed) — so it reads low for a mid-month buyer.
      averageBalance: ratio(h.tokenSeconds, periodSeconds, 4),
      // Over only the time the holder had a non-zero balance — what "how many
      // shares did they hold" usually means.
      averageHeldBalance: ratio(h.tokenSeconds, BigInt(h.heldSeconds), 4),
      sharePercent: ratio(h.tokenSeconds * 100n, denominator, 6),
      grossAmount: gross,
      feeAmount: 0n,
      netAmount: status === Status.SELF_KEPT ? gross : 0n,
      status,
    });
  }

  // Fee and net split over payable rows. A row whose net rounds to zero after
  // the fee is dropped and the split redone (RentDistributor rejects 0).
  let fee = 0n;
  let grossPaid = 0n;
  for (;;) {
    const payable = rows.filter((r) => r.status === Status.PAYABLE);
    grossPaid = payable.reduce((a, r) => a + r.grossAmount, 0n);
    fee = (grossPaid * p.feeBps) / BPS_DENOMINATOR;
    const nets = splitProportionally(
      grossPaid - fee,
      payable.map((r) => r.grossAmount),
    );
    payable.forEach((r, i) => {
      r.netAmount = nets[i];
      r.feeAmount = r.grossAmount - nets[i];
    });
    const zeroed = payable.filter((r) => r.netAmount === 0n);
    if (zeroed.length === 0) break;
    for (const r of zeroed) {
      r.status = Status.ZERO;
      r.feeAmount = 0n;
    }
  }

  const sumWhere = (status) =>
    rows.filter((r) => r.status === status).reduce((a, r) => a + r.grossAmount, 0n);
  const selfKept = sumWhere(Status.SELF_KEPT);
  const excludedIssuer = sumWhere(Status.EXCLUDED_ISSUER);

  rows.sort((a, b) => (b.grossAmount > a.grossAmount ? 1 : b.grossAmount < a.grossAmount ? -1 : a.holder < b.holder ? -1 : 1));

  return {
    periodStart,
    periodEnd,
    rent: p.rent,
    feeBps: p.feeBps,
    allocations: rows,
    totals: {
      grossPaid,
      fee,
      netPaid: grossPaid - fee,
      selfKept,
      excludedIssuer,
      // Stays with the admin: time nobody held a share (pre-launch, burned
      // shares), holders whose share rounds to zero, and rounding dust.
      unallocated: p.rent - grossPaid - selfKept - excludedIssuer,
      // What the admin wallet sends: holders' net + fee.
      adminTransfer: grossPaid,
    },
  };
}

/**
 * Splits payable allocations into RentDistributor batches. The whole fee
 * rides on batch 0.
 */
function buildBatches(allocations, fee, maxBatchSize) {
  const payable = allocations.filter((a) => a.status === Status.PAYABLE);
  const batches = [];
  for (let i = 0; i < payable.length; i += maxBatchSize) {
    const rows = payable.slice(i, i + maxBatchSize);
    batches.push({
      batchIndex: batches.length,
      holders: rows.map((r) => r.holder),
      amount: rows.reduce((a, r) => a + r.netAmount, 0n),
      platformFee: batches.length === 0 ? fee : 0n,
    });
  }
  return batches;
}

module.exports = {
  Status,
  monthBounds,
  holdingTimeline,
  splitProportionally,
  computeRentAllocation,
  buildBatches,
};

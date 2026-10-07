// Run with `npm test` (node:test). The scenarios are the worked examples
// agreed for the rent model, so the numbers here are the spec.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Status,
  monthBounds,
  splitProportionally,
  computeRentAllocation,
  buildBatches,
} = require('./calculator');

const DAY = 86_400;
const usd = (n) => BigInt(Math.round(n * 1e6)); // 6-decimal stablecoin
const ISSUER = '0xissuer';
const ALICE = '0xalice';
const BOB = '0xbob';
const CAROL = '0xcarol';
const DAVE = '0xdave';
const ADMIN = '0xadmin';

const change = (holder, delta, timestamp) => ({ holder, delta: BigInt(delta), timestamp });
const byHolder = (result) => Object.fromEntries(result.allocations.map((a) => [a.holder, a]));

test('monthBounds covers the whole UTC month, incl. leap February', () => {
  assert.deepEqual(monthBounds('2026-09'), { start: Date.UTC(2026, 8, 1) / 1000, end: Date.UTC(2026, 9, 1) / 1000 });
  const feb = monthBounds('2028-02');
  assert.equal((feb.end - feb.start) / DAY, 29);
  assert.throws(() => monthBounds('2026-13'));
  assert.throws(() => monthBounds('Sep 2026'));
});

test('mid-month launch: holders are paid only for days after launch (Sep, 3,000 rent)', () => {
  const { start, end } = monthBounds('2026-09');
  const launch = start + 20 * DAY; // Sep 21
  const buy = start + 25 * DAY; // Sep 26
  const result = computeRentAllocation({
    changes: [change(ISSUER, 100, launch), change(ISSUER, -60, buy), change(ALICE, 60, buy)],
    monthStart: start,
    monthEnd: end,
    totalShares: 100n,
    rent: usd(3000),
    feeBps: 0n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  const rows = byHolder(result);

  assert.equal(rows[ISSUER].grossAmount, usd(700));
  assert.equal(rows[ALICE].grossAmount, usd(300));
  assert.equal(rows[ALICE].daysHeld, '5.00');
  assert.equal(rows[ISSUER].daysHeld, '10.00');
  // Averaged over the 30-day period vs. only over the days actually held.
  assert.equal(rows[ALICE].averageBalance, '10.0000');
  assert.equal(rows[ALICE].averageHeldBalance, '60.0000');
  assert.equal(rows[ISSUER].averageHeldBalance, '70.0000'); // 100 × 5 + 40 × 5 over 10 days
  assert.equal(result.totals.grossPaid, usd(1000));
  assert.equal(result.totals.unallocated, usd(2000)); // the 20 pre-launch days
});

test('orderbook trades: listing keeps shares with the seller, fills move them (Oct, 3,100 rent, 0.1% fee)', () => {
  const { start, end } = monthBounds('2026-10');
  const at = (day) => start + (day - 1) * DAY;
  const result = computeRentAllocation({
    changes: [
      // Opening balances from September.
      change(ISSUER, 40, start - DAY),
      change(ALICE, 60, start - DAY),
      // Oct 11: Alice lists 20 on the Orderbook — no balance change (the
      // subgraph credits custody to the seller), so nothing to record here.
      // Oct 21: Bob fills 15 of the order.
      change(ALICE, -15, at(21)),
      change(BOB, 15, at(21)),
      // Oct 26: Alice cancels the remaining 5 — no balance change.
      // Oct 28: Bob sends 5 directly to Carol.
      change(BOB, -5, at(28)),
      change(CAROL, 5, at(28)),
    ],
    monthStart: start,
    monthEnd: end,
    totalShares: 100n,
    rent: usd(3100),
    feeBps: 10n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  const rows = byHolder(result);

  // Gross = token-days at $1.
  assert.equal(rows[ISSUER].grossAmount, usd(1240));
  assert.equal(rows[ALICE].grossAmount, usd(1695));
  assert.equal(rows[BOB].grossAmount, usd(145));
  assert.equal(rows[CAROL].grossAmount, usd(20));
  assert.equal(rows[ALICE].openingBalance, 60n);
  assert.equal(rows[ALICE].closingBalance, 45n);

  // 0.1% fee on 3,100 = 3.10; holders share 3,096.90 pro rata.
  assert.equal(result.totals.fee, usd(3.1));
  assert.equal(rows[ISSUER].netAmount, usd(1238.76));
  assert.equal(rows[ALICE].netAmount, usd(1693.305));
  assert.equal(rows[BOB].netAmount, usd(144.855));
  assert.equal(rows[CAROL].netAmount, usd(19.98));
  assert.equal(
    result.allocations.reduce((a, r) => a + r.netAmount, 0n) + result.totals.fee,
    usd(3100),
  );
});

test('next month starts from the previous closing balances; a seller stops earning (Nov, 2,800 rent)', () => {
  const { start, end } = monthBounds('2026-11');
  const result = computeRentAllocation({
    changes: [
      change(ISSUER, 40, start - DAY),
      change(ALICE, 45, start - DAY),
      change(BOB, 10, start - DAY),
      change(CAROL, 5, start - DAY),
      // Nov 16: Alice sells all 45 to Dave through the Orderbook.
      change(ALICE, -45, start + 15 * DAY),
      change(DAVE, 45, start + 15 * DAY),
    ],
    monthStart: start,
    monthEnd: end,
    totalShares: 100n,
    rent: usd(2800),
    feeBps: 0n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  const rows = byHolder(result);

  assert.equal(rows[ISSUER].grossAmount, usd(1120));
  assert.equal(rows[ALICE].grossAmount, usd(630));
  assert.equal(rows[DAVE].grossAmount, usd(630));
  assert.equal(rows[BOB].grossAmount, usd(280));
  assert.equal(rows[CAROL].grossAmount, usd(140));
  assert.equal(rows[ALICE].closingBalance, 0n);
  assert.equal(result.totals.unallocated, 0n);
});

test('unsold listing inventory: include vs exclude issuer (10k shares, 1k bought on the 16th)', () => {
  const { start, end } = monthBounds('2026-09');
  const base = {
    changes: [
      change(ISSUER, 10_000, start - DAY),
      // 3,000 listed — stays the issuer's. 1,000 bought on Sep 16:
      change(ISSUER, -1_000, start + 15 * DAY),
      change(ALICE, 1_000, start + 15 * DAY),
    ],
    monthStart: start,
    monthEnd: end,
    totalShares: 10_000n,
    rent: usd(3000),
    feeBps: 0n,
    issuer: ISSUER,
  };

  const included = byHolder(computeRentAllocation({ ...base, excludeIssuer: false }));
  assert.equal(included[ALICE].grossAmount, usd(150));
  assert.equal(included[ISSUER].grossAmount, usd(2850));
  assert.equal(included[ISSUER].status, Status.PAYABLE);

  const excluded = computeRentAllocation({ ...base, excludeIssuer: true });
  const rows = byHolder(excluded);
  // Investors get exactly the same; the issuer's share just isn't sent.
  assert.equal(rows[ALICE].netAmount, usd(150));
  assert.equal(rows[ISSUER].status, Status.EXCLUDED_ISSUER);
  assert.equal(rows[ISSUER].netAmount, 0n);
  assert.equal(excluded.totals.excludedIssuer, usd(2850));
  assert.equal(excluded.totals.adminTransfer, usd(150));
});

test("the admin wallet's own share is kept, not transferred, and pays no fee", () => {
  const { start, end } = monthBounds('2026-09');
  const result = computeRentAllocation({
    changes: [change(ISSUER, 90, start - DAY), change(ADMIN, 10, start - DAY)],
    monthStart: start,
    monthEnd: end,
    totalShares: 100n,
    rent: usd(1000),
    feeBps: 100n, // 1%
    issuer: ISSUER,
    excludeIssuer: false,
    selfWallet: ADMIN,
  });
  const rows = byHolder(result);

  assert.equal(rows[ADMIN].status, Status.SELF_KEPT);
  assert.equal(rows[ADMIN].grossAmount, usd(100));
  assert.equal(result.totals.selfKept, usd(100));
  assert.equal(result.totals.grossPaid, usd(900));
  assert.equal(result.totals.fee, usd(9));
  assert.equal(rows[ISSUER].netAmount, usd(891));
});

test('burned shares stop earning; their rent stays unallocated', () => {
  const { start, end } = monthBounds('2026-09');
  const result = computeRentAllocation({
    changes: [
      change(ISSUER, 50, start - DAY),
      change(ALICE, 50, start - DAY),
      // Sep 16: Alice sells all 50 back into a buyback — burned.
      change(ALICE, -50, start + 15 * DAY),
    ],
    monthStart: start,
    monthEnd: end,
    totalShares: 100n,
    rent: usd(3000),
    feeBps: 0n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  const rows = byHolder(result);

  assert.equal(rows[ISSUER].grossAmount, usd(1500));
  assert.equal(rows[ALICE].grossAmount, usd(750));
  assert.equal(result.totals.unallocated, usd(750));
});

test('partial days count to the second', () => {
  const { start, end } = monthBounds('2026-09');
  const buy = start + 29 * DAY + 15 * 3600; // Sep 30, 15:00 — 9 hours left
  const result = computeRentAllocation({
    changes: [change(ISSUER, 10, start - DAY), change(ISSUER, -10, buy), change(ALICE, 10, buy)],
    monthStart: start,
    monthEnd: end,
    totalShares: 10n,
    rent: usd(7200), // 10 shares × 720 hours → $1 per share-hour
    feeBps: 0n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  const rows = byHolder(result);

  assert.equal(rows[ALICE].grossAmount, usd(90)); // 10 shares × 9 hours
  assert.equal(rows[ALICE].daysHeld, '0.38');
  assert.equal(rows[ISSUER].grossAmount, usd(7110)); // 10 shares × 711 hours
});

test('a month in progress accrues only up to periodEnd, at the full-month rate', () => {
  const { start, end } = monthBounds('2026-09');
  const result = computeRentAllocation({
    changes: [change(ISSUER, 100, start - DAY)],
    monthStart: start,
    monthEnd: end,
    periodEnd: start + 10 * DAY,
    totalShares: 100n,
    rent: usd(3000),
    feeBps: 0n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  assert.equal(byHolder(result)[ISSUER].grossAmount, usd(1000));
});

test('holders whose net rounds to zero are dropped and the split still sums exactly', () => {
  const { start, end } = monthBounds('2026-09');
  const result = computeRentAllocation({
    changes: [change(ISSUER, 999_999, start - DAY), change(ALICE, 1, start - DAY)],
    monthStart: start,
    monthEnd: end,
    totalShares: 1_000_000n,
    rent: 500_000n, // $0.50 — Alice's share is 0.5 base units
    feeBps: 10n,
    issuer: ISSUER,
    excludeIssuer: false,
  });
  const rows = byHolder(result);

  assert.equal(rows[ALICE].status, Status.ZERO);
  assert.equal(rows[ALICE].netAmount, 0n);
  const paid = result.allocations.filter((a) => a.status === Status.PAYABLE);
  assert.equal(paid.reduce((a, r) => a + r.netAmount, 0n) + result.totals.fee, result.totals.grossPaid);
});

test('a persistently negative balance is rejected as corrupt data', () => {
  const { start, end } = monthBounds('2026-09');
  assert.throws(
    () =>
      computeRentAllocation({
        changes: [change(ALICE, -1, start + DAY)],
        monthStart: start,
        monthEnd: end,
        totalShares: 1n,
        rent: usd(1),
        feeBps: 0n,
        issuer: ISSUER,
        excludeIssuer: false,
      }),
    /Negative balance/,
  );
});

test('splitProportionally is exact and deterministic', () => {
  assert.deepEqual(splitProportionally(10n, [1n, 1n, 1n]), [4n, 3n, 3n]);
  assert.deepEqual(splitProportionally(100n, [0n, 0n]), [0n, 0n]);
  const parts = splitProportionally(1_000_003n, [7n, 11n, 13n, 17n]);
  assert.equal(parts.reduce((a, b) => a + b, 0n), 1_000_003n);
});

test('buildBatches chunks payable rows and puts the whole fee on batch 0', () => {
  const allocations = Array.from({ length: 1_201 }, (_, i) => ({
    holder: `0x${i}`,
    netAmount: 1n,
    status: i === 0 ? Status.SELF_KEPT : Status.PAYABLE,
  }));
  const batches = buildBatches(allocations, 7n, 500);

  assert.deepEqual(batches.map((b) => b.holders.length), [500, 500, 200]);
  assert.deepEqual(batches.map((b) => b.platformFee), [7n, 0n, 0n]);
  assert.ok(!batches[0].holders.includes('0x0'));
});

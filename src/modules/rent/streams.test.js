const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig, buildStreamSnapshot, splitByStream } = require('./streams');

const USDC = 6;
const units = (n) => BigInt(Math.round(n * 10 ** USDC));
const fails = (fn, pattern) => assert.throws(fn, (err) => err.statusCode === 400 && pattern.test(err.message));

test('normalizeConfig keeps catalogue order, drops duplicates', () => {
  const cfg = normalizeConfig({ landModel: 'RENT', incomeStreams: ['CAR_WASH', 'FUEL_INCOME', 'CAR_WASH', 'LAND_RENT'] });
  assert.deepEqual(cfg.incomeStreams, ['LAND_RENT', 'FUEL_INCOME', 'CAR_WASH']);
});

test('normalizeConfig defaults to leased land with nothing shared', () => {
  assert.deepEqual(normalizeConfig(), { landModel: 'RENT', incomeStreams: [] });
});

test('normalizeConfig rejects unknown streams, bad land models and non-lists', () => {
  fails(() => normalizeConfig({ incomeStreams: ['LOTTERY'] }), /Unknown income stream/);
  fails(() => normalizeConfig({ landModel: 'LEASE' }), /landModel must be one of/);
  fails(() => normalizeConfig({ incomeStreams: 'FUEL_INCOME' }), /list of stream keys/);
});

test('land owned by the fuel owner cannot also share land rent', () => {
  fails(() => normalizeConfig({ landModel: 'APPRECIATION', incomeStreams: ['LAND_RENT'] }), /appreciation only/);
  // …but appreciation with the other streams is fine.
  const cfg = normalizeConfig({ landModel: 'APPRECIATION', incomeStreams: ['FUEL_INCOME'] });
  assert.deepEqual(cfg, { landModel: 'APPRECIATION', incomeStreams: ['FUEL_INCOME'] });
});

test('snapshot sums only the shared streams the admin entered (Pump #12 example)', () => {
  const config = { incomeStreams: ['FUEL_INCOME', 'CAR_WASH'] }; // store & ATM not shared
  const { streams, total } = buildStreamSnapshot(config, { FUEL_INCOME: '4000', CAR_WASH: '900' }, USDC);
  assert.equal(total, units(4900));
  assert.deepEqual(
    streams.map((s) => [s.key, s.amount]),
    [
      ['FUEL_INCOME', units(4000).toString()],
      ['CAR_WASH', units(900).toString()],
    ],
  );
  assert.equal(streams[0].label, 'Fuel income');
});

test('snapshot follows catalogue order regardless of input order', () => {
  const config = { incomeStreams: ['FUEL_INCOME', 'STORE_MALL'] };
  const { streams } = buildStreamSnapshot(config, { STORE_MALL: 1, FUEL_INCOME: 2 }, USDC);
  assert.deepEqual(streams.map((s) => s.key), ['FUEL_INCOME', 'STORE_MALL']);
});

test('a stream that is not shared is fixed at 0 — sending it is an error', () => {
  const config = { incomeStreams: ['FUEL_INCOME'] };
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: '100', STORE_MALL: '50' }, USDC), /Convenience store & mall is not shared/);
});

test('every shared stream needs an explicit amount (0 is allowed)', () => {
  const config = { incomeStreams: ['FUEL_INCOME', 'CAR_WASH'] };
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: '100' }, USDC), /Enter the net profit for Car wash/);
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: '100', CAR_WASH: '' }, USDC), /Enter the net profit for Car wash/);
  const { total } = buildStreamSnapshot(config, { FUEL_INCOME: '100', CAR_WASH: '0' }, USDC);
  assert.equal(total, units(100));
});

test('amounts must be plain non-negative numbers within the stablecoin decimals', () => {
  const config = { incomeStreams: ['FUEL_INCOME'] };
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: '-5' }, USDC), /0 or more/);
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: '1e3' }, USDC), /0 or more/);
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: 'abc' }, USDC), /0 or more/);
  fails(() => buildStreamSnapshot(config, { FUEL_INCOME: '1.1234567' }, USDC), /at most 6 decimals/);
  assert.equal(buildStreamSnapshot(config, { FUEL_INCOME: '1.123456' }, USDC).total, 1123456n);
});

test('a month where everything earned 0, or nothing is shared, cannot be distributed', () => {
  fails(() => buildStreamSnapshot({ incomeStreams: ['FUEL_INCOME'] }, { FUEL_INCOME: '0' }, USDC), /greater than 0/);
  fails(() => buildStreamSnapshot({ incomeStreams: [] }, {}, USDC), /No income streams are shared/);
});

test('streams must be an object', () => {
  const config = { incomeStreams: ['FUEL_INCOME'] };
  fails(() => buildStreamSnapshot(config, [], USDC), /must be an object/);
  fails(() => buildStreamSnapshot(config, null, USDC), /must be an object/);
  fails(() => buildStreamSnapshot(config, { NOPE: '1' }, USDC), /Unknown income stream/);
});

test("a holder's gross split across streams always adds up exactly", () => {
  const config = { incomeStreams: ['LAND_RENT', 'FUEL_INCOME', 'CAR_WASH', 'ATM_TENANTS'] };
  const { streams } = buildStreamSnapshot(
    config,
    { LAND_RENT: '2500', FUEL_INCOME: '4000.333333', CAR_WASH: '900.000001', ATM_TENANTS: '123.456789' },
    USDC,
  );
  for (const gross of [1n, 7n, 999_999n, 123_456_789n, 4_900_000_017n]) {
    const parts = splitByStream(gross, streams);
    assert.equal(parts.reduce((a, p) => a + BigInt(p.amount), 0n), gross, `gross ${gross}`);
    assert.deepEqual(parts.map((p) => p.key), config.incomeStreams);
  }
});

test('the per-stream split is proportional to each stream', () => {
  const { streams } = buildStreamSnapshot({ incomeStreams: ['FUEL_INCOME', 'CAR_WASH'] }, { FUEL_INCOME: '800', CAR_WASH: '200' }, USDC);
  const parts = splitByStream(units(100), streams); // 80% fuel / 20% car wash
  assert.equal(parts[0].amount, units(80).toString());
  assert.equal(parts[1].amount, units(20).toString());
});

test('splitByStream returns nothing for distributions made before streams existed', () => {
  assert.deepEqual(splitByStream(100n, []), []);
  assert.deepEqual(splitByStream(100n, undefined), []);
});

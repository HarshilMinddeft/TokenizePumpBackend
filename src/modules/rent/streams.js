const { ethers } = require('ethers');
const AppError = require('../../utils/AppError');
const { STREAMS, STREAM_BY_KEY, LAND_MODELS } = require('../../config/incomeStreams');
const { splitProportionally } = require('./calculator');

/**
 * Income-stream rules for rent distributions.
 *
 * Each asset shares a fixed set of streams with its token holders; a stream
 * that is not shared is simply fixed at 0 (not entered, not recorded). A
 * month's distributable rent is the sum of the entered net profits — the
 * on-chain payout and the holder split work on that one total, exactly as
 * before. The per-stream amounts are kept as a snapshot for reporting.
 */

const bad = (message) => new AppError(message, 400);

/**
 * Validates an asset's stream settings and returns them in canonical form
 * (known keys only, de-duplicated, in catalogue order).
 *
 * @param {{ landModel?: string, incomeStreams?: string[] }} input
 * @returns {{ landModel: 'RENT'|'APPRECIATION', incomeStreams: string[] }}
 */
function normalizeConfig({ landModel = 'RENT', incomeStreams = [] } = {}) {
  if (!LAND_MODELS.includes(landModel)) {
    throw bad(`landModel must be one of: ${LAND_MODELS.join(', ')}`);
  }
  if (!Array.isArray(incomeStreams)) throw bad('incomeStreams must be a list of stream keys');

  for (const key of incomeStreams) {
    if (!STREAM_BY_KEY.has(key)) throw bad(`Unknown income stream "${key}"`);
  }
  const chosen = new Set(incomeStreams);

  if (landModel === 'APPRECIATION' && chosen.has('LAND_RENT')) {
    throw bad('Land rent cannot be shared when the land is owned by the fuel owner (appreciation only)');
  }

  return { landModel, incomeStreams: STREAMS.map((s) => s.key).filter((k) => chosen.has(k)) };
}

/**
 * Turns the amounts an admin entered into the month's stream snapshot and
 * total.
 *
 * Every shared stream needs an explicit amount (0 if it earned nothing), and
 * a stream that is not shared must not be sent — its amount is fixed at 0.
 *
 * @param {{ incomeStreams: string[] }} config   the asset's settings
 * @param {Record<string, string|number>} input  net profit per stream key
 * @param {number} decimals                      stablecoin decimals
 * @returns {{ streams: Array<{key: string, label: string, group: string, amount: string}>, total: bigint }}
 */
function buildStreamSnapshot(config, input, decimals) {
  if (config.incomeStreams.length === 0) {
    throw bad('No income streams are shared for this asset, so there is no rent to distribute');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw bad('streams must be an object of net profit per income stream');
  }

  const shared = new Set(config.incomeStreams);
  for (const key of Object.keys(input)) {
    const stream = STREAM_BY_KEY.get(key);
    if (!stream) throw bad(`Unknown income stream "${key}"`);
    if (!shared.has(key)) {
      throw bad(`${stream.label} is not shared for this asset, so its amount is fixed at 0 — leave it out`);
    }
  }

  let total = 0n;
  const streams = config.incomeStreams.map((key) => {
    const { label, group } = STREAM_BY_KEY.get(key);
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') {
      throw bad(`Enter the net profit for ${label} (0 if it earned nothing)`);
    }
    if (!/^\d+(\.\d+)?$/.test(String(raw))) {
      throw bad(`${label} must be 0 or more, e.g. "1200" or "1200.50"`);
    }
    let amount;
    try {
      amount = ethers.parseUnits(String(raw), decimals);
    } catch {
      throw bad(`${label} must have at most ${decimals} decimals`);
    }
    total += amount;
    return { key, label, group, amount: amount.toString() };
  });

  if (total <= 0n) throw bad('The total to distribute must be greater than 0');
  return { streams, total };
}

/**
 * Splits one holder's gross rent across the month's streams, in proportion
 * to each stream's share of the total. Exact: the parts always add up to
 * `gross` (same largest-remainder rule as the holder split).
 *
 * @param {bigint} gross
 * @param {Array<{key: string, label: string, group: string, amount: string}>} streams
 */
function splitByStream(gross, streams) {
  if (!streams?.length) return [];
  const parts = splitProportionally(gross, streams.map((s) => BigInt(s.amount)));
  return streams.map((s, i) => ({ key: s.key, label: s.label, group: s.group, amount: parts[i].toString() }));
}

module.exports = { normalizeConfig, buildStreamSnapshot, splitByStream };

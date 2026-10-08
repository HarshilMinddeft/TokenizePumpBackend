/**
 * The income streams a fuel pump can earn from. One fixed list for the whole
 * platform — each asset chooses which of these it shares with token holders
 * (see Asset.incomeStreams), and each monthly distribution records the net
 * profit entered per stream.
 *
 * `group` follows the A / B / C structure on the landing page.
 */
const STREAMS = [
  { key: 'LAND_RENT', label: 'Land rent', group: 'A' },
  { key: 'FUEL_INCOME', label: 'Fuel income', group: 'B' },
  { key: 'CAR_WASH', label: 'Car wash', group: 'C' },
  { key: 'SERVICE_CENTER', label: 'Service center', group: 'C' },
  { key: 'ATM_TENANTS', label: 'ATMs & tenant services', group: 'C' },
  { key: 'STORE_MALL', label: 'Convenience store & mall', group: 'C' },
  { key: 'EV_CHARGING', label: 'EV charging', group: 'C' },
];

const STREAM_KEYS = STREAMS.map((s) => s.key);
const STREAM_BY_KEY = new Map(STREAMS.map((s) => [s.key, s]));

/**
 * How the land under the pump reaches token holders:
 *  RENT          the fuel company leases it — land rent is an income stream.
 *  APPRECIATION  the fuel owner owns it — there is no land rent; holders
 *                benefit from the land's value rising (the asset price).
 */
const LAND_MODELS = ['RENT', 'APPRECIATION'];

module.exports = { STREAMS, STREAM_KEYS, STREAM_BY_KEY, LAND_MODELS };

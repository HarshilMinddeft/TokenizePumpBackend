const { ethers } = require('ethers');
const env = require('../config/env');
const AppError = require('./AppError');
const { readProvider: provider } = require('./ethers.util');

// Minimal human-readable ABIs — only what the backend reads.
const ABI = {
  erc20: [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ],
  feeManager: [
    'function currentFeeVersion() view returns (uint256)',
    'function treasury() view returns (address)',
    'function getFeeConfig(uint256) view returns (tuple(uint16 saleFeeBps, uint16 saleServicerFeeBps, uint16 interestFeeBps, uint16 interestServicerFeeBps, uint16 foreclosureFeeBps, uint16 preSaleProfitSharingBps))',
  ],
  accessControl: [
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  ],
  rentDistributor: [
    'function MAX_BATCH_SIZE() view returns (uint256)',
    'function executedBatches(bytes32) view returns (bool)',
    'event RentDistributed(bytes32 indexed batchId, uint256 indexed tokenId, address indexed payer, uint256 recipientCount, uint256 distributedAmount, uint256 platformFee, address treasury)',
  ],
};

const AUTHORITY_ROLE = ethers.id('AUTHORITY_ROLE');
const DISTRIBUTOR_ROLE = ethers.id('DISTRIBUTOR_ROLE');
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

function requireAddress(name) {
  const value = env[name];
  if (!value) throw new AppError(`${name} is not configured`, 503);
  return value;
}

const contract = (envName, abi) => new ethers.Contract(requireAddress(envName), abi, provider);

const stablecoin = () => contract('STABLECOIN_ADDRESS', ABI.erc20);
const feeManager = () => contract('FEE_MANAGER_ADDRESS', ABI.feeManager);
const marketplace = () => contract('MARKETPLACE_ADDRESS', ABI.accessControl);
const rentDistributor = () =>
  contract('RENT_DISTRIBUTOR_ADDRESS', [...ABI.rentDistributor, ...ABI.accessControl]);
const erc20 = (address) => new ethers.Contract(address, ABI.erc20, provider);

let stablecoinMeta = null;
/** Stablecoin decimals/symbol — immutable, so read once. */
async function getStablecoinMeta() {
  if (!stablecoinMeta) {
    const token = stablecoin();
    const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
    stablecoinMeta = { address: (await token.getAddress()).toLowerCase(), decimals: Number(decimals), symbol };
  }
  return stablecoinMeta;
}

/** The rent fee: FeeManager's latest version and its saleServicerFeeBps. */
async function getRentFee() {
  const fm = feeManager();
  const [version, treasury] = await Promise.all([fm.currentFeeVersion(), fm.treasury()]);
  const config = await fm.getFeeConfig(version);
  return { feeVersion: version.toString(), feeBps: Number(config.saleServicerFeeBps), treasury: treasury.toLowerCase() };
}

let cachedMaxBatchSize = null;
async function getMaxBatchSize() {
  if (cachedMaxBatchSize === null) cachedMaxBatchSize = Number(await rentDistributor().MAX_BATCH_SIZE());
  return cachedMaxBatchSize;
}

/**
 * Whether a wallet may use the admin panel: listed in ADMIN_WALLET_ADDRESSES,
 * or AUTHORITY_ROLE / DEFAULT_ADMIN_ROLE on the marketplace (the same rule
 * the frontend uses to show admin navigation).
 */
async function isAdminWallet(address) {
  const wallet = address.toLowerCase();
  const allowList = env.ADMIN_WALLET_ADDRESSES.split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (allowList.includes(wallet)) return true;
  if (!env.MARKETPLACE_ADDRESS) return false;

  const mp = marketplace();
  const [authority, admin] = await Promise.all([
    mp.hasRole(AUTHORITY_ROLE, wallet),
    mp.hasRole(DEFAULT_ADMIN_ROLE, wallet),
  ]);
  return authority || admin;
}

/** Whether a wallet can sign RentDistributor.distribute. */
async function canDistribute(address) {
  return rentDistributor().hasRole(DISTRIBUTOR_ROLE, address);
}

/**
 * Outcome of a submitted distribute() tx, read from its receipt.
 * @returns {Promise<{state: 'PENDING'} | {state: 'FAILED'} | {state: 'PAID', blockNumber: number}>}
 */
async function getBatchTxOutcome(txHash, batchId) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { state: 'PENDING' };
  if (receipt.status !== 1) return { state: 'FAILED' };

  const distributor = requireAddress('RENT_DISTRIBUTOR_ADDRESS').toLowerCase();
  const iface = new ethers.Interface(ABI.rentDistributor);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== distributor) continue;
    const parsed = iface.parseLog(log);
    if (parsed?.name === 'RentDistributed' && parsed.args.batchId.toLowerCase() === batchId) {
      return { state: 'PAID', blockNumber: receipt.blockNumber };
    }
  }
  // Succeeded but didn't pay this batch — e.g. the hash of some other tx.
  return { state: 'FAILED' };
}

module.exports = {
  ethers,
  erc20,
  stablecoin,
  rentDistributor,
  getStablecoinMeta,
  getRentFee,
  getMaxBatchSize,
  isAdminWallet,
  canDistribute,
  getBatchTxOutcome,
};

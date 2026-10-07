require('dotenv').config();
const { cleanEnv, str, port, url, num, bool } = require('envalid');

// Matches a 32-byte hex private key, with or without the 0x prefix.
const PRIVATE_KEY_RE = /^(0x)?[0-9a-fA-F]{64}$/;

const privateKey = str({ default: undefined });
const address = str({ default: undefined });

const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'production', 'test'],
    default: 'development',
  }),
  PORT: port({ default: 3001 }),

  // Frontend origin(s) allowed via CORS in production. Comma-separated for
  // multiple origins (e.g. local dev against a deployed backend, plus the
  // real production frontend) — split into a list at use, in app.js.
  CLIENT_URL: str({ default: 'http://localhost:3000' }),

  // MongoDB
  MONGO_URI: str(),

  // Pinata / IPFS
  PINATA_JWT: str(),
  GATEWAY_URL: str(),
  
  // Blockchain
  RPC_URL: url({ default: 'https://robinhood-testnet.drpc.org' }),
  PRIVATE_KEY: str(),
  DEPLOYER_PRIVATE_KEY: str(),

  // Owns the IdFactory — `createIdentity` is onlyOwner, so whichever account
  // this key belongs to MUST be the IdFactory's owner or every identity
  // creation reverts with OwnableUnauthorizedAccount. Defaults to the deployer
  // key so existing single-key setups keep working.
  ID_ISSUER_PRIVATE_KEY: privateKey,

  // Signs ERC-735 KYC claims. Must be registered as a purpose-3 (CLAIM) key on
  // the ClaimIssuer at CLAIM_ISSUER_ADDRESS, otherwise ClaimIssuer.isClaimValid
  // returns false and the identity never verifies. Defaults to the deployer key.
  CLAIM_SIGNER_PRIVATE_KEY: privateKey,

  // ── OnchainID / T-REX contract addresses ────────────────────────────────────
  ID_FACTORY_ADDRESS: address,
  IDENTITY_REGISTRY_ADDRESS: address,
  CLAIM_ISSUER_ADDRESS: address,

  // ISO 3166-1 numeric country code recorded at registration. 784 = UAE.
  DEFAULT_COUNTRY_CODE: num({ default: 784 }),

  // Blockpass KYC
  BLOCKPASS_API_KEY: str(),
  BLOCKPASS_SERVICE_ID: str(),

  // ── Rent distribution ───────────────────────────────────────────────────────
  // Goldsky subgraph (the `prod` tag URL, so redeploys don't change it).
  SUBGRAPH_URL: url({ default: undefined }),
  // Read-only RPC for the rent module. Separate from RPC_URL because dRPC's
  // free tier rejects JSON-RPC batches over 3 requests and can't serve calls
  // at a recent block, both of which rent reads need.
  CHAIN_READ_RPC_URL: url({ default: 'https://rpc.testnet.chain.robinhood.com' }),
  CHAIN_ID: num({ default: 46630 }),
  RENT_DISTRIBUTOR_ADDRESS: address,
  FEE_MANAGER_ADDRESS: address,
  MARKETPLACE_ADDRESS: address,
  STABLECOIN_ADDRESS: address,

  // Comma-separated wallets allowed into admin endpoints, on top of any wallet
  // holding AUTHORITY_ROLE or DEFAULT_ADMIN_ROLE on the marketplace.
  ADMIN_WALLET_ADDRESSES: str({ default: '' }),
  ADMIN_SESSION_TTL_HOURS: num({ default: 12 }),

  // TESTNET ONLY. Lets a distribution cover the month in progress, ending at
  // the subgraph's latest indexed block instead of the month's end — so the
  // flow can be demoed without waiting for a month to close. Leave false in
  // production: a month paid early can't be paid again once it ends.
  RENT_ALLOW_CURRENT_MONTH: bool({ default: false }),
});

// envalid's `str()` can't express "valid private key", so validate the shape
// here — a malformed key otherwise fails deep inside ethers at first use,
// long after startup.
for (const name of ['PRIVATE_KEY', 'DEPLOYER_PRIVATE_KEY', 'ID_ISSUER_PRIVATE_KEY', 'CLAIM_SIGNER_PRIVATE_KEY']) {
  const value = env[name];
  if (value && !PRIVATE_KEY_RE.test(value)) {
    throw new Error(`${name} is not a valid private key — expected 64 hex characters.`);
  }
}

module.exports = env;

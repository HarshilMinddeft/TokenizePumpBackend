const { ethers } = require('ethers');
const env = require('../config/env');

// Singletons — instantiated once at startup, shared across the process
const provider = new ethers.JsonRpcProvider(env.RPC_URL);

const deployer = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);

// Sends IdFactory.createIdentity, which is onlyOwner — this account must be
// the IdFactory's owner. Falls back to the deployer when unset so existing
// single-key deployments keep working unchanged.
const idIssuer = env.ID_ISSUER_PRIVATE_KEY
  ? new ethers.Wallet(env.ID_ISSUER_PRIVATE_KEY, provider)
  : deployer;

// Signs ERC-735 claims. Must hold a purpose-3 (CLAIM) key on the ClaimIssuer;
// otherwise every claim it signs fails ClaimIssuer.isClaimValid.
const claimSigner = env.CLAIM_SIGNER_PRIVATE_KEY
  ? new ethers.Wallet(env.CLAIM_SIGNER_PRIVATE_KEY, provider)
  : deployer;

// Read-only provider for the rent module. No batching (one request per call)
// and a fixed network, so it never spends a request re-detecting the chain.
const readProvider = new ethers.JsonRpcProvider(env.CHAIN_READ_RPC_URL, env.CHAIN_ID, {
  staticNetwork: true,
  batchMaxCount: 1,
});

module.exports = { provider, readProvider, deployer, idIssuer, claimSigner };

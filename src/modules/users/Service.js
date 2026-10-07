const path = require('path');
const User = require('../../entities/User');
const { ethers } = require('ethers');
const { deployer, idIssuer, claimSigner } = require('../../utils/ethers.util');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

// Contract ABIs
const identityRegistryAbi = require(path.join(
  process.cwd(),
  'artifacts/contracts/RwaERC-3643/registry/implementation/IdentityRegistry.sol/IdentityRegistry.json',
)).abi;
const IdentityAbi = require(path.join(process.cwd(), 'artifacts/contracts/onchainId/Identity.json')).abi;
const idFactoryAbi = require('../../abi/IdFactory.abi.json');

// Identities are no longer deployed directly — IdFactory deploys an
// IdentityProxy via CREATE2 behind the shared ImplementationAuthority, so only
// the ABI is needed here, never the bytecode.

const KYC_CLAIM_TOPIC = 1;
const CLAIM_SCHEME_ECDSA = 1;

/**
 * Deterministic per-user salt. MUST match the convention used by the contracts
 * repo's deploy script (scripts/deployOnchainIdFlow.mjs), or the same user gets
 * a different identity address depending on which path created it.
 * IdFactory internally prefixes this with "OID".
 */
function identitySaltFor(walletAddress) {
  return `user-${walletAddress.toLowerCase()}`;
}

class Service {
  /**
   * Create a new user record.
   */
  async addUser({ refId, userWalletAddress, kycActive }) {
    const user = new User({ refId, userWalletAddress, kycActive });
    await user.save();
    return user;
  }

  /**
   * Fetch a user by their Blockpass refId.
   * @param {string} refId
   */
  async getUserByRefId(refId) {
    const user = await User.findOne({ refId });
    if (!user) throw new AppError('User not found.', 404);
    return user;
  }

  /**
   * Handle a Blockpass webhook event.
   * On KYC approval: creates the user's OnchainID identity via IdFactory
   * (an IdentityProxy, CREATE2-deployed behind the shared
   * ImplementationAuthority), adds a KYC claim to it, and registers it in
   * IdentityRegistry so `isVerified(wallet)` returns true.
   *
   * Every step is idempotent — Blockpass retries webhooks, and both
   * createIdentity and registerIdentity revert on a second call for the same
   * wallet, so each is guarded by an on-chain existence check.
   *
   * @param {{ status: string, refId: string }} payload
   */
  async handleBlockpassWebhook({ status, refId }) {
    if (status !== 'approved') {
      console.info(`[Blockpass] KYC status update for ${refId}: ${status}`);
      return;
    }

    console.info(`[Blockpass] KYC approved for ${refId}`);

    const user = await User.findOne({ refId });
    if (!user) {
      console.warn(`[Blockpass] User not found for refId: ${refId}`);
      return;
    }

    const userWallet = user.userWalletAddress;

    const identityRegistry = new ethers.Contract(
      env.IDENTITY_REGISTRY_ADDRESS,
      identityRegistryAbi,
      deployer,
    );

    // Already fully onboarded — nothing left to do.
    if (await identityRegistry.isVerified(userWallet)) {
      console.info(`[Blockpass] ${userWallet} is already verified — skipping.`);
      return;
    }

    const identityAddress = await this.#ensureIdentity(userWallet);
    await this.#ensureKycClaim(identityAddress, refId);
    await this.#ensureRegistered(identityRegistry, userWallet, identityAddress);

    // Confirm the full claim-topics + trusted-issuer + registry wiring
    // actually resolves, rather than assuming the writes were sufficient.
    if (!(await identityRegistry.isVerified(userWallet))) {
      throw new AppError(
        `Identity ${identityAddress} was registered for ${userWallet} but isVerified() is false. ` +
          'Check that the claim issuer is trusted for topic 1 and that the claim signer holds a CLAIM key on it.',
        502,
      );
    }

    user.identityAddress = identityAddress;
    user.kycActive = true;
    await user.save();

    console.info(`[Blockpass] KYC process completed for ${refId} — identity ${identityAddress} verified.`);
  }

  /**
   * Returns the user's identity address, creating it through IdFactory if it
   * doesn't exist yet. `createIdentityWithManagementKeys` is onlyOwner, so
   * this is sent by the ID_ISSUER key, which must own the IdFactory.
   *
   * Created with claimSigner as the identity's ONLY management key — the
   * user's wallet gets none. This is deliberately custodial: plain
   * `createIdentity` gives the user's wallet the sole key, but this webhook
   * runs server-side with no user present to sign, so claimSigner needs a key
   * on the identity to call `addClaim` itself. IdFactory has no function that
   * grants a wallet AND an extra key together —
   * createIdentityWithManagementKeys's deploy path never gives `_wallet` a
   * key at all (see IdFactory.sol: it deploys with the factory itself as the
   * initial key, adds each entry in `_managementKeys`, then removes the
   * factory's key — `_wallet` is never in that list, and passing its hash
   * explicitly reverts with "wallet is also listed in management keys").
   * Giving the user a key as well requires a second, user-signed transaction
   * (identity.addKey from their own wallet) — out of scope for this
   * server-only flow.
   */
  async #ensureIdentity(userWallet) {
    const idFactory = new ethers.Contract(env.ID_FACTORY_ADDRESS, idFactoryAbi, idIssuer);

    // IdFactory keeps its own wallet -> identity mapping, so this doubles as
    // the idempotency guard: createIdentityWithManagementKeys reverts with
    // "wallet already linked to an identity" on a repeat call.
    const existing = await idFactory.getIdentity(userWallet);
    if (existing !== ethers.ZeroAddress) {
      console.info(`[Blockpass] Reusing existing identity ${existing} for ${userWallet}`);
      return existing;
    }

    const salt = identitySaltFor(userWallet);

    // isSaltTaken expects the already-prefixed salt — IdFactory stores
    // "OID" + salt internally.
    if (await idFactory.isSaltTaken(`OID${salt}`)) {
      throw new AppError(
        `IdFactory salt "OID${salt}" is already taken but ${userWallet} has no linked identity. ` +
          'This wallet was likely onboarded under a different salt convention.',
        409,
      );
    }

    // claimSigner is the sole management key — see the class doc above for
    // why the user's wallet isn't included. Encoded as
    // keccak256(abi.encode(address)) per ERC-734, same as the purpose checks
    // in #ensureKycClaim.
    const managementKeys = [claimSigner.address].map((addr) =>
      ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr])),
    );

    console.info(`[Blockpass] Creating identity via IdFactory for wallet: ${userWallet}`);
    const tx = await idFactory.createIdentityWithManagementKeys(userWallet, salt, managementKeys);
    const receipt = await tx.wait();

    // The identity is deployed BY the factory, so receipt.contractAddress is
    // null — the address comes from the WalletLinked event instead.
    const identityAddress = this.#readWalletLinkedIdentity(idFactory, receipt);
    console.info(`[Blockpass] Identity proxy created at: ${identityAddress}`);
    return identityAddress;
  }

  /**
   * Extracts the new identity address from the WalletLinked event in a
   * createIdentity receipt.
   */
  #readWalletLinkedIdentity(idFactory, receipt) {
    for (const log of receipt.logs) {
      // Logs from other contracts in the same tx won't parse — skip them.
      let parsed;
      try {
        parsed = idFactory.interface.parseLog(log);
      } catch {
        continue;
      }
      if (parsed?.name === 'WalletLinked') return parsed.args.identity;
    }
    throw new AppError(
      `IdFactory.createIdentityWithManagementKeys succeeded (tx ${receipt.hash}) but emitted no WalletLinked event.`,
      502,
    );
  }
  
  /**
   * Adds the KYC claim to the identity, unless an equivalent claim from the
   * same issuer is already present.
   */
  async #ensureKycClaim(identityAddress, refId) {
    const identity = new ethers.Contract(identityAddress, IdentityAbi, claimSigner);

    // ERC-735 claim ids are keccak256(abi.encode(issuer, topic)) — one claim
    // per (issuer, topic) pair, so this detects an already-added claim.
    const claimId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [env.CLAIM_ISSUER_ADDRESS, KYC_CLAIM_TOPIC],
      ),
    );
    const [existingTopic] = await identity.getClaim(claimId);
    if (existingTopic !== 0n) {
      console.info(`[Blockpass] KYC claim already present on ${identityAddress} — skipping.`);
      return;
    }
  
    const data = ethers.toUtf8Bytes('KYC-verified');
    const uri = `Kyc-BlockPass-${refId}`;

    // Digest must match what ClaimIssuer.isClaimValid recovers against:
    // keccak256(abi.encode(identity, topic, data)), then EIP-191 prefixed.
    const dataHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes'],
        [identityAddress, KYC_CLAIM_TOPIC, data],
      ),
    );
    const signature = await claimSigner.signMessage(ethers.getBytes(dataHash));

    const tx = await identity.addClaim(
      KYC_CLAIM_TOPIC,
      CLAIM_SCHEME_ECDSA,
      env.CLAIM_ISSUER_ADDRESS,
      signature,
      ethers.hexlify(data),
      uri,
    );
    const receipt = await tx.wait();
    console.info(`[Blockpass] Claim added in block: ${receipt.blockNumber}`);
  }

  /**
   * Registers the wallet -> identity link in IdentityRegistry. This is the
   * call `isVerified()` reads through — writing to IdentityRegistryStorage
   * directly bypasses the registry's own bookkeeping and leaves the user
   * unverified.
   */
  async #ensureRegistered(identityRegistry, userWallet, identityAddress) {
    if (await identityRegistry.contains(userWallet)) {
      console.info(`[Blockpass] ${userWallet} already registered in IdentityRegistry — skipping.`);
      return;
    }

    // registerIdentity is onlyAgent — the deployer account must hold agent
    // rights on the IdentityRegistry.
    const tx = await identityRegistry.registerIdentity(
      userWallet,
      identityAddress,
      env.DEFAULT_COUNTRY_CODE,
    );
    const receipt = await tx.wait();
    console.info(`[Blockpass] Identity registered. Tx: ${receipt.hash}`);
  }
}

module.exports = Service;

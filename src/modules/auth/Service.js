const crypto = require('crypto');
const { ethers } = require('ethers');
const AdminSession = require('../../entities/AdminSession');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { isAdminWallet } = require('../../utils/contracts.util');

const NONCE_TTL_MS = 5 * 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

class Service {
  /**
   * Issues a one-time message for the wallet to sign. Refused up front for
   * wallets that aren't admins, so a non-admin never gets as far as signing.
   * @param {string} address
   */
  async createNonce(address) {
    const wallet = address.toLowerCase();
    if (!(await isAdminWallet(wallet))) throw new AppError('This wallet is not an admin', 403);

    const message = [
      'Sign in to the TrueFraction admin panel.',
      '',
      `Wallet: ${ethers.getAddress(wallet)}`,
      `Nonce: ${crypto.randomBytes(16).toString('hex')}`,
      `Issued at: ${new Date().toISOString()}`,
    ].join('\n');

    // One outstanding nonce per wallet — a newer request replaces the older.
    await AdminSession.deleteMany({ kind: 'NONCE', address: wallet });
    await AdminSession.create({
      kind: 'NONCE',
      address: wallet,
      message,
      expiresAt: new Date(Date.now() + NONCE_TTL_MS),
    });
    return { message };
  }

  /**
   * Checks the signature over the issued message and opens a session.
   * @param {string} address
   * @param {string} signature
   */
  async verify(address, signature) {
    const wallet = address.toLowerCase();
    // Consumed on first use, success or not, so a nonce can't be replayed.
    const nonce = await AdminSession.findOneAndDelete({ kind: 'NONCE', address: wallet });
    if (!nonce || nonce.expiresAt < new Date()) {
      throw new AppError('Sign-in request expired — request a new message', 401);
    }

    let signer;
    try {
      signer = ethers.verifyMessage(nonce.message, signature).toLowerCase();
    } catch {
      throw new AppError('Invalid signature', 401);
    }
    if (signer !== wallet) throw new AppError('Signature does not match the wallet', 401);

    // Re-checked here: the role may have been revoked since the nonce.
    if (!(await isAdminWallet(wallet))) throw new AppError('This wallet is not an admin', 403);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + env.ADMIN_SESSION_TTL_HOURS * 3600 * 1000);
    await AdminSession.create({ kind: 'SESSION', address: wallet, tokenHash: sha256(token), expiresAt });

    return { token, address: wallet, expiresAt };
  }

  /**
   * Resolves a bearer token to its admin wallet, or null.
   * @param {string} token
   */
  async resolveSession(token) {
    const session = await AdminSession.findOne({ kind: 'SESSION', tokenHash: sha256(token) });
    if (!session || session.expiresAt < new Date()) return null;
    return { address: session.address, expiresAt: session.expiresAt };
  }

  /** @param {string} token */
  async logout(token) {
    await AdminSession.deleteOne({ kind: 'SESSION', tokenHash: sha256(token) });
  }
}

module.exports = new Service();

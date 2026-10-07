const mongoose = require('mongoose');
const { ethers } = require('ethers');
const AppError = require('../../utils/AppError');

class Validator {
  static address(req, _res, next) {
    if (!ethers.isAddress(req.params.address || '')) {
      return next(new AppError('A valid wallet address is required', 400));
    }
    next();
  }

  static tokenId(req, _res, next) {
    if (!/^\d+$/.test(req.params.tokenId || '')) return next(new AppError('tokenId must be a number', 400));
    next();
  }

  static distributionId(req, _res, next) {
    if (!mongoose.isValidObjectId(req.params.id)) return next(new AppError('Invalid distribution id', 400));
    next();
  }

  static createDistribution(req, _res, next) {
    const { tokenId, month, rent, excludeIssuer, note } = req.body || {};
    if (tokenId === undefined || !/^\d+$/.test(String(tokenId))) {
      return next(new AppError('tokenId is required', 400));
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
      return next(new AppError('month is required as YYYY-MM', 400));
    }
    // A decimal string or number; decimals are checked against the
    // stablecoin's own decimals in the service.
    if (rent === undefined || !/^\d+(\.\d+)?$/.test(String(rent))) {
      return next(new AppError('rent must be a positive amount, e.g. "3000" or "3000.50"', 400));
    }
    if (excludeIssuer !== undefined && typeof excludeIssuer !== 'boolean') {
      return next(new AppError('excludeIssuer must be true or false', 400));
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
      return next(new AppError('note must be text up to 500 characters', 400));
    }
    next();
  }

  static submitBatch(req, _res, next) {
    if (!/^\d+$/.test(req.params.batchIndex || '')) return next(new AppError('Invalid batch index', 400));
    if (!/^0x[0-9a-fA-F]{64}$/.test(req.body?.txHash || '')) {
      return next(new AppError('txHash must be a 32-byte transaction hash', 400));
    }
    next();
  }
}

module.exports = Validator;

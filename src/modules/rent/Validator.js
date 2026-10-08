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
    const { tokenId, month, rent, streams, excludeIssuer, note } = req.body || {};
    if (tokenId === undefined || !/^\d+$/.test(String(tokenId))) {
      return next(new AppError('tokenId is required', 400));
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
      return next(new AppError('month is required as YYYY-MM', 400));
    }
    // Rent is no longer a single figure: it is the sum of the net profit
    // entered per income stream. Which streams are required, and the amounts'
    // decimals, are checked against the asset's settings in the service.
    if (rent !== undefined) {
      return next(new AppError('rent is no longer accepted — send the net profit per income stream in `streams`', 400));
    }
    if (!streams || typeof streams !== 'object' || Array.isArray(streams)) {
      return next(new AppError('streams is required, e.g. { "FUEL_INCOME": "4000", "CAR_WASH": "900" }', 400));
    }
    if (excludeIssuer !== undefined && typeof excludeIssuer !== 'boolean') {
      return next(new AppError('excludeIssuer must be true or false', 400));
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
      return next(new AppError('note must be text up to 500 characters', 400));
    }
    next();
  }

  static updateStreams(req, _res, next) {
    const { landModel, incomeStreams, note } = req.body || {};
    if (typeof landModel !== 'string') return next(new AppError('landModel is required', 400));
    if (!Array.isArray(incomeStreams)) return next(new AppError('incomeStreams must be a list of stream keys', 400));
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

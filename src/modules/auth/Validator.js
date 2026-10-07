const { ethers } = require('ethers');
const AppError = require('../../utils/AppError');

class Validator {
  static nonce(req, _res, next) {
    const { address } = req.body || {};
    if (!address || !ethers.isAddress(address)) {
      return next(new AppError('A valid wallet address is required', 400));
    }
    next();
  }

  static verify(req, _res, next) {
    const { address, signature } = req.body || {};
    if (!address || !ethers.isAddress(address)) {
      return next(new AppError('A valid wallet address is required', 400));
    }
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      return next(new AppError('signature is required', 400));
    }
    next();
  }
}

module.exports = Validator;

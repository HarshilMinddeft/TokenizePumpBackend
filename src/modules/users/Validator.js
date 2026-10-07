const AppError = require('../../utils/AppError');

class Validator {
  static addUser(req, _res, next) {
    const { refId, userWalletAddress, kycActive } = req.body || {};
    if (!refId || !userWalletAddress || kycActive === undefined) {
      return next(new AppError('All fields are required.', 400));
    }
    next();
  }

  static getUserByRefId(req, _res, next) {
    const { refId } = req.params || {};
    if (!refId) {
      return next(new AppError('refId is required.', 400));
    }
    next();
  }

  static blockpassWebhook(req, _res, next) {
    const { refId, status } = req.body || {};
    if (!refId || !status) {
      return next(new AppError('Payload must contain refId and status', 400));
    }
    next();
  }
}

module.exports = Validator;

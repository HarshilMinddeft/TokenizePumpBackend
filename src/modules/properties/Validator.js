const AppError = require('../../utils/AppError');

class Validator {
  static nftUpload(req, _res, next) {
    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }
    next();
  }

  static addProperty(req, _res, next) {
    const {
      propertyId,
      propertyName,
      propertyPrice,
      propertySize,
      propertyOwnerWallet,
      propertyFeatures,
      offringDetailes,
      propertyDetailes,
      propertyManagement,
      locationDetailes,
      propertyDocuments,
      propertyImages,
      propertyThumbImages,
      complianceAddress,
    } = req.body || {};

    const required = [
      propertyId,
      propertyName,
      propertyPrice,
      propertySize,
      propertyOwnerWallet,
      propertyFeatures,
      offringDetailes,
      propertyDetailes,
      propertyManagement,
      locationDetailes,
      propertyDocuments,
      propertyImages,
      propertyThumbImages,
      complianceAddress,
    ];

    if (required.some((v) => v === undefined || v === null || v === '')) {
      return next(new AppError('All fields are required.', 400));
    }
    next();
  }

  static getPropertiesByOwner(req, _res, next) {
    const { ownerAddress } = req.query || {};
    if (!ownerAddress) {
      return next(new AppError('ownerAddress is required', 400));
    }
    next();
  }

  static getPropertyById(req, _res, next) {
    const { id } = req.params || {};
    if (!id) {
      return next(new AppError('Property ID is required', 400));
    }
    next();
  }
}

module.exports = Validator;

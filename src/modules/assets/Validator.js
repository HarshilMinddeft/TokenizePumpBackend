const AppError = require('../../utils/AppError');

class Validator {
  static nftUpload(req, _res, next) {
    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }
    next();
  }

  static addAsset(req, _res, next) {
    const {
      assetId,
      assetName,
      assetPrice,
      assetSize,
      assetOwnerWallet,
      assetFeatures,
      offeringDetails,
      assetDetails,
      assetManagement,
      locationDetails,
      assetDocuments,
      assetImages,
      assetThumbImages,
      complianceAddress,
    } = req.body || {};

    const required = [
      assetId,
      assetName,
      assetPrice,
      assetSize,
      assetOwnerWallet,
      assetFeatures,
      offeringDetails,
      assetDetails,
      assetManagement,
      locationDetails,
      assetDocuments,
      assetImages,
      assetThumbImages,
      complianceAddress,
    ];

    if (required.some((v) => v === undefined || v === null || v === '')) {
      return next(new AppError('All fields are required.', 400));
    }
    next();
  }

  static getAssetsByOwner(req, _res, next) {
    const { ownerAddress } = req.query || {};
    if (!ownerAddress) {
      return next(new AppError('ownerAddress is required', 400));
    }
    next();
  }

  static getAssetById(req, _res, next) {
    const { id } = req.params || {};
    if (!id) {
      return next(new AppError('Asset ID is required', 400));
    }
    next();
  }
}

module.exports = Validator;

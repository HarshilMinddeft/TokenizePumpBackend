const path = require('path');
const Asset = require('../../entities/Asset');
const { uploadFileToIPFS, uploadJSONToIPFS } = require('../../utils/ipfs.util');
const AppError = require('../../utils/AppError');

class Service {
  /**
   * Upload an image/file to IPFS.
   * @param {Express.Multer.File} file - Multer file object
   */
  async nftUpload(file) {
    const filePath = path.join(process.cwd(), 'uploads', file.filename);
    return uploadFileToIPFS(filePath, file.originalname);
  }

  /**
   * Upload arbitrary JSON metadata to IPFS.
   * @param {object} jsonData
   */
  async uploadMetadata(jsonData) {
    return uploadJSONToIPFS(jsonData);
  }

  /**
   * Persist a new asset document.
   * @param {object} data - Asset fields from request body
   */
  async addAsset(data) {
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
      active,
    } = data;

    const asset = new Asset({
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
      active,
    });

    await asset.save();
    return asset;
  }

  /**
   * Fetch all assets owned by a wallet address.
   * @param {string} ownerAddress
   */
  async getAssetsByOwner(ownerAddress) {
    return Asset.find({ assetOwnerWallet: ownerAddress.toLowerCase() });
  }

  /**
   * Fetch a lightweight summary list for the marketplace.
   */
  async getAllAssetsSummary() {
    return Asset.find(
      {},
      { assetId: 1, assetPrice: 1, assetName: 1, assetThumbImages: 1, assetSize: 1 },
    );
  }

  /**
   * Fetch a single asset by its string assetId.
   * @param {string} id
   */
  async getAssetById(id) {
    const asset = await Asset.findOne({ assetId: id });
    if (!asset) throw new AppError('Asset not found', 404);
    return asset;
  }
}

module.exports = Service;

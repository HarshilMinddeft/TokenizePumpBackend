const path = require('path');
const Asset = require('../../entities/Asset');
const { uploadFileToIPFS, uploadJSONToIPFS } = require('../../utils/ipfs.util');
const AppError = require('../../utils/AppError');
const { normalizeConfig } = require('../rent/streams');
const { isDuplicateKey } = require('../../utils/dbErrors');

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
   * @param {object} data - Asset fields from request body (incl. optional
   *   landModel / incomeStreams — see modules/rent/streams.js)
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
      landModel,
      incomeStreams,
      active,
    } = data;

    // Optional: when the owner picked the land model and the streams to share
    // at tokenization. Left out, the schema defaults apply (leased land, fuel
    // income shared). Rejects unknown streams and land-rent-on-owned-land.
    const streamSettings =
      landModel === undefined && incomeStreams === undefined
        ? {}
        : normalizeConfig({ landModel, incomeStreams });

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
      ...streamSettings,
      active,
    });

    try {
      await asset.save();
    } catch (err) {
      // The same NFT registered twice — typically a retry after a first
      // attempt whose reply never arrived. Say so; the client treats it as done.
      if (isDuplicateKey(err)) throw new AppError(`Asset ${assetId} is already registered`, 409);
      throw err;
    }
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

const path = require('path');
const Property = require('../../entities/Property');
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
   * Persist a new property document.
   * @param {object} data - Property fields from request body
   */
  async addProperty(data) {
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
      active,
    } = data;

    const property = new Property({
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
      active,
    });

    await property.save();
    return property;
  }

  /**
   * Fetch all properties owned by a wallet address.
   * @param {string} ownerAddress
   */
  async getPropertiesByOwner(ownerAddress) {
    return Property.find({ propertyOwnerWallet: ownerAddress.toLowerCase() });
  }

  /**
   * Fetch a lightweight summary list for the marketplace.
   */
  async getAllPropertiesSummary() {
    return Property.find(
      {},
      { propertyId: 1, propertyPrice: 1, propertyName: 1, propertyThumbImages: 1, propertySize: 1 },
    );
  }

  /**
   * Fetch a single property by its string propertyId.
   * @param {string} id
   */
  async getPropertyById(id) {
    const property = await Property.findOne({ propertyId: id });
    if (!property) throw new AppError('Property not found', 404);
    return property;
  }
}

module.exports = Service;

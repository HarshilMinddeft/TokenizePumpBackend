const BaseController = require('../../core/BaseController');
const AssetService = require('./Service');
const AppError = require('../../utils/AppError');

class Controller extends BaseController {
  #service;

  constructor() {
    super();
    this.#service = new AssetService();
  }

  /** @param {import('express').Response} res @param {Error} err */
  #catch(res, err) {
    if (err instanceof AppError) return this.httpError(res, err.message, err.statusCode);
    console.error('[AssetController]', err);
    return this.internalError(res, 'An unexpected error occurred');
  }

  nftUpload = async (req, res) => {
    try {
      const result = await this.#service.nftUpload(req.file);
      return this.ok(res, 'File uploaded to IPFS', result);
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  uploadMetadata = async (req, res) => {
    try {
      const result = await this.#service.uploadMetadata(req.body);
      return this.ok(res, 'Metadata uploaded to IPFS', result);
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  addAsset = async (req, res) => {
    try {
      const asset = await this.#service.addAsset(req.body);
      return this.created(res, 'Asset added successfully', { asset });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getAssetsByOwner = async (req, res) => {
    try {
      const { ownerAddress } = req.query;
      const assets = await this.#service.getAssetsByOwner(ownerAddress);
      return this.ok(res, 'Assets fetched', { assets });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getAllAssetsSummary = async (_req, res) => {
    try {
      const assets = await this.#service.getAllAssetsSummary();
      return this.ok(res, 'Assets summary fetched', { assets });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getAssetById = async (req, res) => {
    try {
      const asset = await this.#service.getAssetById(req.params.id);
      return this.ok(res, 'Asset fetched', { asset });
    } catch (err) {
      return this.#catch(res, err);
    }
  };
}

module.exports = new Controller();

const BaseController = require('../../core/BaseController');
const PropertyService = require('./Service');
const AppError = require('../../utils/AppError');

class Controller extends BaseController {
  #service;

  constructor() {
    super();
    this.#service = new PropertyService();
  }

  /** @param {import('express').Response} res @param {Error} err */
  #catch(res, err) {
    if (err instanceof AppError) return this.httpError(res, err.message, err.statusCode);
    console.error('[PropertyController]', err);
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

  addProperty = async (req, res) => {
    try {
      const property = await this.#service.addProperty(req.body);
      return this.created(res, 'Property added successfully', { property });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getPropertiesByOwner = async (req, res) => {
    try {
      const { ownerAddress } = req.query;
      const properties = await this.#service.getPropertiesByOwner(ownerAddress);
      return this.ok(res, 'Properties fetched', { properties });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getAllPropertiesSummary = async (_req, res) => {
    try {
      const properties = await this.#service.getAllPropertiesSummary();
      return this.ok(res, 'Properties summary fetched', { properties });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getPropertyById = async (req, res) => {
    try {
      const property = await this.#service.getPropertyById(req.params.id);
      return this.ok(res, 'Property fetched', { property });
    } catch (err) {
      return this.#catch(res, err);
    }
  };
}

module.exports = new Controller();

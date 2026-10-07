const BaseController = require('../../core/BaseController');
const UserService = require('./Service');
const AppError = require('../../utils/AppError');

class Controller extends BaseController {
  #service;

  constructor() {
    super();
    this.#service = new UserService();
  }

  /** @param {import('express').Response} res @param {Error} err */
  #catch(res, err) {
    if (err instanceof AppError) return this.httpError(res, err.message, err.statusCode);
    console.error('[UserController]', err);
    return this.internalError(res, 'An unexpected error occurred');
  }

  addUser = async (req, res) => {
    try {
      const user = await this.#service.addUser(req.body);
      return this.created(res, 'User created successfully', { user });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  getUserByRefId = async (req, res) => {
    try {
      const user = await this.#service.getUserByRefId(req.params.refId);
      return this.ok(res, 'User fetched', { user });
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  blockpassWebhook = async (req, res) => {
    const payload = req.body;
    console.info(`[Blockpass] Webhook received at ${new Date().toISOString()}`);

    res.status(200).json({ success: true, message: 'Webhook received' });

    this.#service.handleBlockpassWebhook(payload).catch((err) => {
      console.error('[Blockpass] KYC flow error:', err.message);
    });
  };
}

module.exports = new Controller();

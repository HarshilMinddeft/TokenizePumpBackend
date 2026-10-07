const BaseController = require('../../core/BaseController');
const AuthService = require('./Service');
const AppError = require('../../utils/AppError');

class Controller extends BaseController {
  /** @param {import('express').Response} res @param {Error} err */
  #catch(res, err) {
    if (err instanceof AppError) return this.httpError(res, err.message, err.statusCode);
    console.error('[AuthController]', err);
    return this.internalError(res, 'An unexpected error occurred');
  }

  nonce = async (req, res) => {
    try {
      const result = await AuthService.createNonce(req.body.address);
      return this.ok(res, 'Sign this message with your wallet', result);
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  verify = async (req, res) => {
    try {
      const session = await AuthService.verify(req.body.address, req.body.signature);
      return this.ok(res, 'Signed in', session);
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  me = async (req, res) => this.ok(res, 'Signed in', req.admin);

  logout = async (req, res) => {
    try {
      await AuthService.logout(req.adminToken);
      return this.ok(res, 'Signed out');
    } catch (err) {
      return this.#catch(res, err);
    }
  };
}

module.exports = new Controller();

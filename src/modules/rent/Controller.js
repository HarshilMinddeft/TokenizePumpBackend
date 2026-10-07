const BaseController = require('../../core/BaseController');
const RentService = require('./Service');
const AppError = require('../../utils/AppError');

const pageOf = (query) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
});

class Controller extends BaseController {
  /** @param {import('express').Response} res @param {Error} err */
  #catch(res, err) {
    if (err instanceof AppError) return this.httpError(res, err.message, err.statusCode);
    console.error('[RentController]', err);
    return this.internalError(res, 'An unexpected error occurred');
  }

  #handle(fn, message) {
    return async (req, res) => {
      try {
        return this.ok(res, message, await fn(req));
      } catch (err) {
        return this.#catch(res, err);
      }
    };
  }

  // ── Public ──────────────────────────────────────────────────────────────────
  status = this.#handle(() => RentService.getStatus(), 'Rent status fetched');

  investorSummary = this.#handle(
    (req) => RentService.getInvestorSummary(req.params.address),
    'Investor summary fetched',
  );

  investorPayouts = this.#handle(
    (req) => RentService.getInvestorPayouts(req.params.address, pageOf(req.query)),
    'Rent payouts fetched',
  );

  investorActivity = this.#handle(
    (req) => RentService.getInvestorActivity(req.params.address, pageOf(req.query)),
    'Activity fetched',
  );

  // ── Admin ───────────────────────────────────────────────────────────────────
  overview = this.#handle((req) => RentService.getOverview(req.admin.address), 'Overview fetched');

  properties = this.#handle(() => RentService.listProperties(), 'Properties fetched');

  holders = this.#handle((req) => RentService.getHolders(req.params.tokenId), 'Holders fetched');

  createDistribution = async (req, res) => {
    try {
      const result = await RentService.createDistribution(req.body, req.admin.address);
      return this.created(res, 'Draft distribution created', result);
    } catch (err) {
      return this.#catch(res, err);
    }
  };

  listDistributions = this.#handle(
    (req) =>
      RentService.listDistributions({
        tokenId: req.query.tokenId,
        status: req.query.status,
        ...pageOf(req.query),
      }),
    'Distributions fetched',
  );

  getDistribution = this.#handle((req) => RentService.getDistribution(req.params.id), 'Distribution fetched');

  submitBatch = this.#handle(
    (req) =>
      RentService.markBatchSubmitted(
        req.params.id,
        Number(req.params.batchIndex),
        req.body.txHash,
        req.admin.address,
      ),
    'Batch submitted',
  );

  syncDistribution = this.#handle((req) => RentService.syncDistribution(req.params.id), 'Distribution synced');

  cancelDistribution = this.#handle((req) => RentService.cancelDistribution(req.params.id), 'Distribution cancelled');
}

module.exports = new Controller();

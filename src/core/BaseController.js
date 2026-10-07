/**
 * BaseController — shared HTTP response helpers for Express controllers.
 * Adapted from melkior-backend's BaseController for Express (res) instead of Fastify (reply).
 */
class BaseController {
  #send(res, statusCode, success, message, data) {
    const body = { success, message };
    if (data !== undefined) body.data = data;
    return res.status(statusCode).json(body);
  }

  ok(res, message = 'Success', data) {
    return this.#send(res, 200, true, message, data);
  }

  created(res, message = 'Created', data) {
    return this.#send(res, 201, true, message, data);
  }

  noContent(res) {
    return res.status(204).send();
  }

  badRequest(res, message = 'Bad Request', data) {
    return this.#send(res, 400, false, message, data);
  }

  unauthorized(res, message = 'Unauthorized', data) {
    return this.#send(res, 401, false, message, data);
  }

  forbidden(res, message = 'Forbidden', data) {
    return this.#send(res, 403, false, message, data);
  }

  notFound(res, message = 'Not Found', data) {
    return this.#send(res, 404, false, message, data);
  }

  conflict(res, message = 'Conflict', data) {
    return this.#send(res, 409, false, message, data);
  }

  unprocessable(res, message = 'Unprocessable Entity', data) {
    return this.#send(res, 422, false, message, data);
  }

  tooManyRequests(res, message = 'Too Many Requests', data) {
    return this.#send(res, 429, false, message, data);
  }

  internalError(res, message = 'Internal Server Error', data) {
    return this.#send(res, 500, false, message, data);
  }

  serviceUnavailable(res, message = 'Service Unavailable', data) {
    return this.#send(res, 503, false, message, data);
  }

  httpError(res, message, statusCode = 400, data) {
    return this.#send(res, statusCode, false, message, data);
  }
}

module.exports = BaseController;

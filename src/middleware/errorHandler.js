const env = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Global Express error handler.
 * Must be registered AFTER all routes (4-argument signature required by Express).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Log full error in development
  if (env.NODE_ENV === 'development') {
    console.error(err);
  } else {
    console.error(`[${err.name || 'Error'}] ${err.message}`);
  }

  const statusCode = err instanceof AppError ? err.statusCode : (err.status || 500);
  const message =
    statusCode === 500 && env.NODE_ENV !== 'development'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;

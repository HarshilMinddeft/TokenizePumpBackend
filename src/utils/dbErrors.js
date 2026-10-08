const AppError = require('./AppError');

// Driver/Mongoose error names raised when the database can't be reached at
// all (DNS hiccup, dropped connection, no primary) rather than a bad query.
const UNREACHABLE = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNotConnectedError',
]);

/** The database is temporarily unreachable — retrying shortly is the right response. */
const isDbUnreachable = (err) =>
  UNREACHABLE.has(err?.name) || (err?.name === 'MongooseError' && /buffering timed out/i.test(err?.message ?? ''));

/** A unique index rejected the write (the record already exists). */
const isDuplicateKey = (err) => err?.code === 11000;

/**
 * Turns the database failures a client can act on into an AppError, or
 * returns null for anything else (which stays a 500 and gets logged).
 */
const dbErrorToAppError = (err) => {
  if (isDbUnreachable(err)) {
    return new AppError('The database is temporarily unreachable — please try again in a moment.', 503);
  }
  return null;
};

module.exports = { isDbUnreachable, isDuplicateKey, dbErrorToAppError };

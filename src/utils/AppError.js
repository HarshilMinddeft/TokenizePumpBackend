class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
    // Preserve proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

module.exports = AppError;

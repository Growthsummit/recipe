/**
 * Operational error with an HTTP status code and an optional machine-readable code.
 * Anything thrown that is NOT an AppError is treated as an unexpected 500.
 */
export class AppError extends Error {
  constructor(statusCode, message, code = undefined, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (message, code) => new AppError(400, message, code);
export const unauthorized = (message = 'Authentication required', code) =>
  new AppError(401, message, code);
export const forbidden = (message = 'You do not have permission to do that', code) =>
  new AppError(403, message, code);
export const notFound = (message = 'Resource not found', code) =>
  new AppError(404, message, code);
export const conflict = (message, code) => new AppError(409, message, code);

/**
 * Wraps an async route handler so rejected promises reach the Express error handler
 * instead of crashing the process.
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

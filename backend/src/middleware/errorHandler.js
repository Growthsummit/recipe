import { AppError } from '../utils/errors.js';
import { isProduction } from '../config/env.js';

/** 404 for anything that did not match a route. */
export function notFoundHandler(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

/**
 * Central error handler. Operational AppErrors are surfaced with their message;
 * anything else is logged and returned as a generic 500 so internals/secrets
 * are never leaked to the client.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _req, res, _next) {
  const normalized = normalizeError(error);
  const isOperational = normalized instanceof AppError;

  if (!isOperational) {
    console.error('[unhandled error]', error);
  }

  const status = isOperational ? normalized.statusCode : 500;
  const body = {
    success: false,
    error: {
      message: isOperational ? normalized.message : 'Something went wrong on the server.',
      code: isOperational ? normalized.code || 'ERROR' : 'INTERNAL_ERROR',
    },
  };

  if (isOperational && normalized.details) body.error.details = normalized.details;

  // Only expose stack traces in development, and only for unexpected failures.
  if (!isProduction && !isOperational) body.error.stack = error.stack;

  res.status(status).json(body);
}

/**
 * Turns the framework's own 4xx errors (malformed JSON, oversized payload,
 * bad CORS origin, ...) into AppErrors so they are not reported as 500s.
 */
function normalizeError(error) {
  if (error instanceof AppError) return error;

  const status = error.status || error.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    if (error.type === 'entity.too.large') {
      return new AppError(413, 'Request payload is too large.', 'PAYLOAD_TOO_LARGE');
    }
    if (error.type === 'entity.parse.failed') {
      return new AppError(400, 'Malformed JSON in the request body.', 'INVALID_JSON');
    }
    return new AppError(status, error.message || 'Bad request.', 'BAD_REQUEST');
  }
  return error;
}

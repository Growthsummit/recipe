import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

/**
 * Validates `req.body`, `req.query` and/or `req.params` against Zod schemas.
 * On success the parsed (and stripped) values replace the originals so
 * unexpected fields can never reach the database layer.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.query) req.validatedQuery = schemas.query.parse(req.query ?? {});
    // Merge rather than replace: declared params are validated/coerced while any
    // extra route params (e.g. `:permission`) are preserved.
    if (schemas.params) req.params = { ...req.params, ...schemas.params.parse(req.params ?? {}) };
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      return next(new AppError(422, 'The submitted data is invalid.', 'VALIDATION_ERROR', details));
    }
    next(error);
  }
};

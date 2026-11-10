import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimiters.js';
import {
  addCookingHistoryHandler,
  addFavouriteHandler,
  createReviewHandler,
  getMyRatingHandler,
  listReviewsHandler,
  rateRecipeHandler,
  removeFavouriteHandler,
} from '../controllers/interactionController.js';
import {
  cookingHistorySchema,
  idParamSchema,
  ratingSchema,
  reviewSchema,
} from '../validators/interactionValidators.js';

// Mounted at /api/recipes - recipe scoped interactions.
const router = Router({ mergeParams: true });

const recipeIdParam = z.object({ recipeId: z.coerce.number().int().positive() });

router.post(
  '/:recipeId/favourite',
  authenticate,
  requirePermission('favourite:manage'),
  validate({ params: recipeIdParam }),
  addFavouriteHandler
);
router.delete(
  '/:recipeId/favourite',
  authenticate,
  requirePermission('favourite:manage'),
  validate({ params: recipeIdParam }),
  removeFavouriteHandler
);

router.post(
  '/:recipeId/rating',
  authenticate,
  requirePermission('rating:manage'),
  validate({ params: recipeIdParam, body: ratingSchema }),
  rateRecipeHandler
);
router.get('/:recipeId/rating', authenticate, requirePermission('rating:manage'), validate({ params: recipeIdParam }), getMyRatingHandler);

router.get('/:recipeId/reviews', optionalAuthenticate, requirePermission('recipe:read'), validate({ params: recipeIdParam }), listReviewsHandler);
router.post(
  '/:recipeId/reviews',
  authenticate,
  requirePermission('review:create'),
  writeLimiter,
  validate({ params: recipeIdParam, body: reviewSchema }),
  createReviewHandler
);

router.post(
  '/:recipeId/history',
  authenticate,
  requirePermission('history:manage'),
  validate({ params: recipeIdParam, body: cookingHistorySchema }),
  addCookingHistoryHandler
);

export { idParamSchema };
export default router;

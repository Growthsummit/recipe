import express, { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimiters.js';
import {
  create,
  getById,
  list,
  listMine,
  recordRecipeView,
  remove,
  update,
} from '../controllers/recipeController.js';
import { uploadRecipeImage } from '../controllers/recipeImageController.js';
import {
  createRecipeSchema,
  listRecipesQuerySchema,
  updateRecipeSchema,
} from '../validators/recipeValidators.js';
import { idParamSchema } from '../validators/interactionValidators.js';

const router = Router();

const slugParamSchema = z.object({ idOrSlug: z.string().trim().min(1).max(140) });

// Collection
router.get('/', optionalAuthenticate, requirePermission('recipe:read'), validate({ query: listRecipesQuerySchema }), list);
router.get('/mine', authenticate, requirePermission('recipe:read'), validate({ query: listRecipesQuerySchema }), listMine);
router.post(
  '/images',
  authenticate,
  requirePermission('recipe:create'),
  writeLimiter,
  express.raw({ type: '*/*', limit: '5mb' }),
  uploadRecipeImage
);
router.post(
  '/',
  authenticate,
  requirePermission('recipe:create'),
  writeLimiter,
  validate({ body: createRecipeSchema }),
  create
);

// Single recipe
router.get('/:idOrSlug', optionalAuthenticate, requirePermission('recipe:read'), validate({ params: slugParamSchema }), getById);
router.post('/:id/view', optionalAuthenticate, requirePermission('recipe:read'), validate({ params: idParamSchema }), recordRecipeView);
router.put(
  '/:id',
  authenticate,
  validate({ params: idParamSchema, body: updateRecipeSchema }),
  update
);
router.patch(
  '/:id',
  authenticate,
  validate({ params: idParamSchema, body: updateRecipeSchema }),
  update
);
router.delete('/:id', authenticate, validate({ params: idParamSchema }), remove);

export default router;

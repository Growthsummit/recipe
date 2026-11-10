import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  create,
  getBySlug,
  list,
  remove,
  update,
} from '../controllers/categoryController.js';
import { categorySchema } from '../validators/recipeValidators.js';
import { idParamSchema } from '../validators/interactionValidators.js';

const router = Router();

router.get('/', optionalAuthenticate, requirePermission('category:read'), list);
router.get('/:slug', optionalAuthenticate, requirePermission('category:read'), validate({ params: z.object({ slug: z.string().trim().min(1).max(80) }) }), getBySlug);
router.post('/', authenticate, requirePermission('category:manage'), validate({ body: categorySchema }), create);
router.patch(
  '/:id',
  authenticate,
  requirePermission('category:manage'),
  validate({ params: idParamSchema, body: categorySchema.partial() }),
  update
);
router.delete('/:id', authenticate, requirePermission('category:manage'), validate({ params: idParamSchema }), remove);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  deleteReviewHandler,
  updateReviewHandler,
} from '../controllers/interactionController.js';

const router = Router();
const reviewIdParam = z.object({ id: z.coerce.number().int().positive() });

router.patch(
  '/:id',
  authenticate,
  requirePermission('review:update:own'),
  validate({ params: reviewIdParam, body: z.object({ body: z.string().trim().min(3).max(2000) }).strict() }),
  updateReviewHandler
);
router.delete(
  '/:id',
  authenticate,
  requirePermission('review:delete:own'),
  validate({ params: reviewIdParam }),
  deleteReviewHandler
);

export default router;

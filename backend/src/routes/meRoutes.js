import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  listCookingHistoryHandler,
  listFavouritesHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
} from '../controllers/interactionController.js';
import {
  listRecipesQuerySchema,
} from '../validators/recipeValidators.js';
import { preferencesSchema } from '../validators/interactionValidators.js';
import { consentSchema, deleteAccountSchema } from '../validators/privacyValidators.js';
import { deleteMyAccountHandler, exportMyDataHandler, getMyConsentsHandler, updateMyConsentsHandler } from '../controllers/privacyController.js';

// Mounted at /api/users/me - everything is scoped to req.auth.id.
const router = Router();

router.get('/favourites', authenticate, requirePermission('favourite:manage'), validate({ query: listRecipesQuerySchema }), listFavouritesHandler);
router.get('/history', authenticate, requirePermission('history:manage'), validate({ query: listRecipesQuerySchema }), listCookingHistoryHandler);
router.get('/preferences', authenticate, requirePermission('preference:manage'), getPreferencesHandler);
router.put('/preferences', authenticate, requirePermission('preference:manage'), validate({ body: preferencesSchema }), updatePreferencesHandler);
router.get('/export', authenticate, requirePermission('profile:manage'), exportMyDataHandler);
router.get('/consents', authenticate, requirePermission('profile:manage'), getMyConsentsHandler);
router.put('/consents', authenticate, requirePermission('profile:manage'), validate({ body: consentSchema }), updateMyConsentsHandler);
router.delete('/', authenticate, requirePermission('profile:manage'), validate({ body: deleteAccountSchema }), deleteMyAccountHandler);

export default router;

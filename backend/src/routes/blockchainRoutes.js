import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimiters.js';
import {
  blockchainDashboardHandler,
  confirmRegistrationHandler,
  failedRegistrationHandler,
  myWalletHandler,
  prepareRegistrationHandler,
  recipeHistoryHandler,
  submittedTransactionHandler,
  transactionLookupHandler,
  verifyRecipeHandler,
  verifyWalletHandler,
  walletChallengeHandler,
} from '../controllers/blockchainController.js';
import {
  blockchainConfirmationSchema,
  blockchainFailureSchema,
  blockchainRecipeParams,
  blockchainSubmissionSchema,
  transactionParams,
  walletChallengeSchema,
  walletVerifySchema,
} from '../validators/blockchainValidators.js';

const router = Router();

router.get('/wallet', authenticate, requirePermission('profile:manage'), myWalletHandler);
router.post('/wallet/challenge', authenticate, requirePermission('profile:manage'), writeLimiter, validate({ body: walletChallengeSchema }), walletChallengeHandler);
router.post('/wallet/verify', authenticate, requirePermission('profile:manage'), writeLimiter, validate({ body: walletVerifySchema }), verifyWalletHandler);

router.post('/register/:id', authenticate, requirePermission('recipe:create'), writeLimiter, validate({ params: blockchainRecipeParams }), prepareRegistrationHandler);
router.post('/submitted/:id', authenticate, requirePermission('recipe:create'), writeLimiter, validate({ params: blockchainRecipeParams, body: blockchainSubmissionSchema }), submittedTransactionHandler);
router.post('/confirm/:id', authenticate, requirePermission('recipe:create'), writeLimiter, validate({ params: blockchainRecipeParams, body: blockchainConfirmationSchema }), confirmRegistrationHandler);
router.post('/failure/:id', authenticate, requirePermission('recipe:create'), validate({ params: blockchainRecipeParams, body: blockchainFailureSchema }), failedRegistrationHandler);

router.get('/verify/:id', optionalAuthenticate, requirePermission('recipe:read'), validate({ params: blockchainRecipeParams }), verifyRecipeHandler);
router.get('/history/:id', optionalAuthenticate, requirePermission('recipe:read'), validate({ params: blockchainRecipeParams }), recipeHistoryHandler);
router.get('/transaction/:txHash', optionalAuthenticate, requirePermission('recipe:read'), validate({ params: transactionParams }), transactionLookupHandler);
router.get('/dashboard', authenticate, requirePermission('recipe:read'), blockchainDashboardHandler);

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/authorize.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import {
  changePassword,
  login,
  logout,
  me,
  register,
  resetPassword,
  updateMe,
} from '../controllers/authController.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), resetPassword);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, requirePermission('profile:manage'), me);
router.patch('/me', authenticate, requirePermission('profile:manage'), validate({ body: updateProfileSchema }), updateMe);
router.put('/me/password', authenticate, requirePermission('profile:manage'), validate({ body: changePasswordSchema }), changePassword);

export default router;

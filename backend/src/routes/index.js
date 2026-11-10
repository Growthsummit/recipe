import { Router } from 'express';
import authRoutes from './authRoutes.js';
import recipeRoutes from './recipeRoutes.js';
import interactionRoutes from './interactionRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import meRoutes from './meRoutes.js';
import adminRoutes from './adminRoutes.js';
import blockchainRoutes from './blockchainRoutes.js';
import aiRoutes from './aiRoutes.js';
import { pingDatabase } from '../config/database.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    const ok = await pingDatabase();
    res.json({ success: true, data: { status: ok ? 'ok' : 'degraded', database: ok ? 'connected' : 'unavailable' } });
  } catch (error) {
    res.status(503).json({ success: false, error: { message: 'Database unavailable', code: 'DB_UNAVAILABLE' } });
  }
});

router.use('/auth', authRoutes);
// Recipe CRUD first, then the recipe-scoped interactions (favourite/rating/review/history).
router.use('/recipes', recipeRoutes);
router.use('/recipes', interactionRoutes);
router.use('/categories', categoryRoutes);
router.use('/reviews', reviewRoutes);
router.use('/users/me', meRoutes);
router.use('/admin', adminRoutes);
router.use('/blockchain', blockchainRoutes);
router.use('/ai', aiRoutes);

export default router;

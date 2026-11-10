import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { clusters, discovery, health, ingredientRecommendations, popularity, recipeCluster, similarRecipes } from '../controllers/aiController.js';

const router = Router();
const recipeId = z.object({ recipeId: z.coerce.number().int().positive() });
const recommendationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  source: z.enum(['recipehub', 'foodcom']).optional(),
}).strict();
const ingredientsBody = z.object({
  ingredients: z.array(z.string().trim().min(1).max(160)).min(1).max(30),
  exclude_recipe_ids: z.array(z.string().max(80)).max(200).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  source: z.enum(['recipehub', 'foodcom']).optional(),
}).strict();

router.get('/health', health);
router.get('/recommendations/:recipeId', validate({ params: recipeId, query: recommendationQuery }), similarRecipes);
router.post('/recommendations/ingredients', validate({ body: ingredientsBody }), ingredientRecommendations);
router.get('/popularity/:recipeId', validate({ params: recipeId }), popularity);
router.get('/clusters', clusters);
router.get('/discovery', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }).strict() }), discovery);
router.get('/clusters/:recipeId', validate({ params: recipeId }), recipeCluster);

export default router;

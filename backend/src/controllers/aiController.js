import { asyncHandler, badRequest } from '../utils/errors.js';
import { callAi } from '../services/aiService.js';
import { queryAll } from '../config/database.js';

async function keepPublishedRecipehubItems(items, idField = 'source_recipe_id') {
  const ids = [...new Set(items.map((item) => String(item[idField] ?? '')).filter((id) => /^\d+$/.test(id)))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await queryAll(`SELECT id FROM recipes WHERE is_published = 1 AND status = 'published' AND id IN (${placeholders})`, ids);
  const published = new Set(rows.map((row) => String(row.id)));
  return items.filter((item) => published.has(String(item[idField] ?? '')));
}

export const health = asyncHandler(async (_req, res) => {
  const status = await callAi('health');
  res.json({ success: true, data: status });
});

export const similarRecipes = asyncHandler(async (req, res) => {
  const { limit = 10, source } = req.validatedQuery;
  const query = new URLSearchParams({ limit: String(limit), ...(source ? { source } : {}) }).toString();
  const result = await callAi(`recommendations/recipehub:${encodeURIComponent(req.params.recipeId)}`, { query });
  if (source === 'recipehub') result.recipes = await keepPublishedRecipehubItems(result.recipes || []);
  res.json({ success: true, data: result });
});

export const ingredientRecommendations = asyncHandler(async (req, res) => {
  const result = await callAi('recommendations/ingredients', { method: 'POST', body: req.body });
  if (req.body.source === 'recipehub') result.recipes = await keepPublishedRecipehubItems(result.recipes || []);
  res.json({ success: true, data: result });
});

export const popularity = asyncHandler(async (req, res) => {
  const result = await callAi(`popularity/recipehub:${encodeURIComponent(req.params.recipeId)}`);
  res.json({ success: true, data: result });
});

export const clusters = asyncHandler(async (_req, res) => {
  const result = await callAi('clusters');
  res.json({ success: true, data: result });
});

export const discovery = asyncHandler(async (req, res) => {
  const result = await callAi('discovery/recipehub', {
    query: new URLSearchParams({ limit: String(req.validatedQuery.limit) }).toString(),
  });
  result.recipes = await keepPublishedRecipehubItems(result.recipes || [], 'recipe_id');
  res.json({ success: true, data: result });
});

export const recipeCluster = asyncHandler(async (req, res) => {
  const result = await callAi(`clusters/recipehub:${encodeURIComponent(req.params.recipeId)}`);
  res.json({ success: true, data: result });
});

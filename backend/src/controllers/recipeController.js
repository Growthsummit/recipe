import { asyncHandler, forbidden, notFound } from '../utils/errors.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import {
  createRecipe,
  deleteRecipe,
  findRecipeAuthor,
  getRecipe,
  listRecipes,
  updateRecipe,
} from '../services/recipeService.js';
import { recordView } from '../services/interactionService.js';
import { recordAudit } from '../services/auditService.js';

const q = (req) => req.validatedQuery || req.query;

/** GET /api/recipes */
export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(q(req));
  const filters = q(req);
  const { items, total } = await listRecipes(filters, pagination, { auth: req.auth });
  res.json({ success: true, data: paginated(items, total, pagination) });
});

/** GET /api/recipes/mine - the signed-in user's own recipes (including drafts) */
export const listMine = asyncHandler(async (req, res) => {
  const pagination = parsePagination(q(req));
  const { items, total } = await listRecipes(
    { ...q(req), authorId: req.auth.id, includeUnpublished: 'true' },
    pagination,
    { auth: req.auth }
  );
  res.json({ success: true, data: paginated(items, total, pagination) });
});

/** GET /api/recipes/:idOrSlug */
export const getById = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const incrementViews = q(req).view === 'true';
  const recipe = await getRecipe(idOrSlug, { auth: req.auth, incrementViews });
  res.json({ success: true, data: { recipe } });
});

/** POST /api/recipes/:id/view - records a view */
export const recordRecipeView = asyncHandler(async (req, res) => {
  const result = await recordView(Number(req.params.id));
  res.json({ success: true, data: result });
});

/** POST /api/recipes */
export const create = asyncHandler(async (req, res) => {
  const recipe = await createRecipe(req.auth.id, req.body);

  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'RECIPE_CREATED',
    entity: 'recipe',
    entityId: recipe.id,
    req,
    metadata: { title: recipe.title },
  });

  res.status(201).json({ success: true, data: { recipe } });
});

/** PATCH /api/recipes/:id */
export const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await findRecipeAuthor(id);
  if (!existing) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

  const isOwner = Number(existing.author_id) === Number(req.auth.id);
  const canManageAny = req.auth.permissions.includes('recipe:update:any');
  if (!isOwner && !canManageAny) {
    throw forbidden('You can only edit your own recipes.', 'RECIPE_NOT_OWNED');
  }

  const recipe = await updateRecipe(id, req.body);

  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'RECIPE_UPDATED',
    entity: 'recipe',
    entityId: id,
    req,
    metadata: { fields: Object.keys(req.body) },
  });

  res.json({ success: true, data: { recipe } });
});

/** DELETE /api/recipes/:id */
export const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await findRecipeAuthor(id);
  if (!existing) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

  const isOwner = Number(existing.author_id) === Number(req.auth.id);
  const canManageAny = req.auth.permissions.includes('recipe:delete:any');
  if (!isOwner && !canManageAny) {
    throw forbidden('You can only delete your own recipes.', 'RECIPE_NOT_OWNED');
  }

  await deleteRecipe(id);

  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'RECIPE_DELETED',
    entity: 'recipe',
    entityId: id,
    req,
    metadata: { title: existing.title },
  });

  res.json({ success: true, data: { id, deleted: true } });
});

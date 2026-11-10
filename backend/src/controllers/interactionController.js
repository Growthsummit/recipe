import { asyncHandler } from '../utils/errors.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import {
  addCookingHistory,
  addFavourite,
  createReview,
  deleteReview,
  getPreferences,
  getUserRating,
  listCookingHistory,
  listFavourites,
  listReviews,
  rateRecipe,
  removeFavourite,
  updatePreferences,
  updateReview,
} from '../services/interactionService.js';
import { recordAudit } from '../services/auditService.js';

const q = (req) => req.validatedQuery || req.query;

// -- Favourites --------------------------------------------------------------

export const addFavouriteHandler = asyncHandler(async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  const result = await addFavourite(req.auth.id, recipeId);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'FAVOURITE_ADDED',
    entity: 'recipe',
    entityId: recipeId,
    req,
  });
  res.status(201).json({ success: true, data: result });
});

export const removeFavouriteHandler = asyncHandler(async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  const result = await removeFavourite(req.auth.id, recipeId);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'FAVOURITE_REMOVED',
    entity: 'recipe',
    entityId: recipeId,
    req,
  });
  res.json({ success: true, data: result });
});

export const listFavouritesHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination(q(req));
  const { items, total } = await listFavourites(req.auth.id, pagination);
  res.json({ success: true, data: paginated(items, total, pagination) });
});

// -- Ratings -----------------------------------------------------------------

export const rateRecipeHandler = asyncHandler(async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  const result = await rateRecipe(req.auth.id, recipeId, req.body.rating);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'RECIPE_RATED',
    entity: 'recipe',
    entityId: recipeId,
    req,
    metadata: { rating: req.body.rating },
  });
  res.json({ success: true, data: result });
});

export const getMyRatingHandler = asyncHandler(async (req, res) => {
  const rating = await getUserRating(req.auth.id, Number(req.params.recipeId));
  res.json({ success: true, data: { rating } });
});

// -- Reviews -----------------------------------------------------------------

export const listReviewsHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination({ ...q(req), limit: q(req).limit || 20 });
  const { items, total } = await listReviews(Number(req.params.recipeId), pagination);
  res.json({ success: true, data: paginated(items, total, pagination) });
});

export const createReviewHandler = asyncHandler(async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  const review = await createReview(req.auth.id, recipeId, req.body.body, req.body.rating ?? null);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'REVIEW_CREATED',
    entity: 'review',
    entityId: review.id,
    req,
    metadata: { recipeId },
  });
  res.status(201).json({ success: true, data: { review } });
});

export const updateReviewHandler = asyncHandler(async (req, res) => {
  const review = await updateReview(req.auth, Number(req.params.id), req.body.body);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'REVIEW_UPDATED',
    entity: 'review',
    entityId: review.id,
    req,
  });
  res.json({ success: true, data: { review } });
});

export const deleteReviewHandler = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await deleteReview(req.auth, id);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'REVIEW_DELETED',
    entity: 'review',
    entityId: id,
    req,
  });
  res.json({ success: true, data: { id, deleted: true } });
});

// -- Cooking history ---------------------------------------------------------

export const addCookingHistoryHandler = asyncHandler(async (req, res) => {
  const recipeId = Number(req.params.recipeId);
  const entry = await addCookingHistory(req.auth.id, recipeId, req.body);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'COOKING_HISTORY_ADDED',
    entity: 'recipe',
    entityId: recipeId,
    req,
  });
  res.status(201).json({ success: true, data: { entry } });
});

export const listCookingHistoryHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination(q(req));
  const { items, total } = await listCookingHistory(req.auth.id, pagination);
  res.json({ success: true, data: paginated(items, total, pagination) });
});

// -- Preferences -------------------------------------------------------------

export const getPreferencesHandler = asyncHandler(async (req, res) => {
  const preferences = await getPreferences(req.auth.id);
  res.json({ success: true, data: { preferences } });
});

export const updatePreferencesHandler = asyncHandler(async (req, res) => {
  const preferences = await updatePreferences(req.auth.id, req.body);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'PREFERENCES_UPDATED',
    entity: 'user_preferences',
    entityId: req.auth.id,
    req,
  });
  res.json({ success: true, data: { preferences } });
});

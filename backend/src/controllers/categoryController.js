import { asyncHandler, notFound } from '../utils/errors.js';
import {
  createCategory,
  deleteCategory,
  getCategoryBySlug,
  listCategories,
  updateCategory,
} from '../services/categoryService.js';
import { recordAudit } from '../services/auditService.js';

export const list = asyncHandler(async (_req, res) => {
  const categories = await listCategories();
  res.json({ success: true, data: { categories } });
});

export const getBySlug = asyncHandler(async (req, res) => {
  const category = await getCategoryBySlug(req.params.slug);
  if (!category) throw notFound('Category not found', 'CATEGORY_NOT_FOUND');
  res.json({ success: true, data: { category } });
});

export const create = asyncHandler(async (req, res) => {
  const category = await createCategory(req.body);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'CATEGORY_CREATED',
    entity: 'category',
    entityId: category.id,
    req,
    metadata: { name: category.name },
  });
  res.status(201).json({ success: true, data: { category } });
});

export const update = asyncHandler(async (req, res) => {
  const category = await updateCategory(Number(req.params.id), req.body);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'CATEGORY_UPDATED',
    entity: 'category',
    entityId: category.id,
    req,
  });
  res.json({ success: true, data: { category } });
});

export const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await deleteCategory(id);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'CATEGORY_DELETED',
    entity: 'category',
    entityId: id,
    req,
  });
  res.json({ success: true, data: { id, deleted: true } });
});

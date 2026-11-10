import { execute, queryAll, queryOne } from '../config/database.js';
import { slugify } from '../utils/slug.js';
import { conflict, notFound } from '../utils/errors.js';

const CATEGORY_SELECT = `
  SELECT c.id, c.slug, c.name, c.emoji, c.description, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM recipes r WHERE r.category_id = c.id
            AND r.is_published = 1 AND r.status = 'published') AS recipe_count
    FROM categories c`;

export async function listCategories() {
  return queryAll(`${CATEGORY_SELECT} ORDER BY c.name ASC`);
}

export async function getCategoryBySlug(slug) {
  return queryOne(`${CATEGORY_SELECT} WHERE c.slug = ?`, [String(slug).toLowerCase()]);
}

export async function createCategory({ name, emoji = null, description = null }) {
  const slug = slugify(name);
  const existing = await queryOne('SELECT id FROM categories WHERE slug = ? OR name = ?', [slug, name]);
  if (existing) throw conflict('A category with that name already exists.', 'CATEGORY_EXISTS');

  const result = await execute(
    'INSERT INTO categories (slug, name, emoji, description) VALUES (?, ?, ?, ?)',
    [slug, name, emoji, description]
  );
  return queryOne(`${CATEGORY_SELECT} WHERE c.id = ?`, [Number(result.lastInsertRowid)]);
}

export async function updateCategory(id, { name, emoji, description }) {
  const current = await queryOne('SELECT * FROM categories WHERE id = ?', [id]);
  if (!current) throw notFound('Category not found', 'CATEGORY_NOT_FOUND');

  const sets = [];
  const args = [];
  if (name !== undefined) {
    sets.push('name = ?');
    args.push(name);
    sets.push('slug = ?');
    args.push(slugify(name));
  }
  if (emoji !== undefined) {
    sets.push('emoji = ?');
    args.push(emoji);
  }
  if (description !== undefined) {
    sets.push('description = ?');
    args.push(description);
  }

  if (sets.length) {
    await execute(
      `UPDATE categories SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      [...args, id]
    );
  }
  return queryOne(`${CATEGORY_SELECT} WHERE c.id = ?`, [id]);
}

export async function deleteCategory(id) {
  const current = await queryOne('SELECT id FROM categories WHERE id = ?', [id]);
  if (!current) throw notFound('Category not found', 'CATEGORY_NOT_FOUND');
  // Recipes keep existing: recipes.category_id is set to NULL by the FK rule.
  await execute('DELETE FROM categories WHERE id = ?', [id]);
}

/** Used by the seeder and by recipe creation when only a name is supplied. */
export async function ensureCategory(name, emoji = null) {
  const slug = slugify(name);
  await execute(
    'INSERT INTO categories (slug, name, emoji) VALUES (?, ?, ?) ON CONFLICT (slug) DO NOTHING',
    [slug, name, emoji]
  );
  return queryOne('SELECT * FROM categories WHERE slug = ?', [slug]);
}

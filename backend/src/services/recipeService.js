import { execute, queryAll, queryOne, withTransaction } from '../config/database.js';
import { slugify } from '../utils/slug.js';
import { notFound } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Ingredient helpers
// ---------------------------------------------------------------------------

/**
 * Turns an ingredient string such as "200 g pasta" into
 * { displayText, name, quantity, unit }. Falls back gracefully when no
 * leading measurement is present ("Salt and black pepper").
 */
export function parseIngredient(input) {
  if (typeof input !== 'string') {
    const displayText = (input.displayText || input.name || '').trim();
    const name = (input.name || displayText.replace(/^[\d\s.,/½¼¾-]+/, '').trim() || displayText).trim();
    return {
      displayText,
      name: name.toLowerCase() || displayText.toLowerCase(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
    };
  }

  const displayText = input.trim();
  const match = displayText.match(/^([\d½¼¾⅓⅔.,/\s-]+)\s*([a-zA-Z%]{1,20})?\.?\s+(.+)$/);
  if (match) {
    const [, quantity, unit, remainder] = match;
    return {
      displayText,
      name: remainder.trim().toLowerCase(),
      quantity: quantity.trim(),
      unit: unit ? unit.trim().toLowerCase() : null,
    };
  }
  return { displayText, name: displayText.toLowerCase(), quantity: null, unit: null };
}

/** Instruction input may be a plain string or { title, text }. */
export function normalizeInstruction(input) {
  if (typeof input === 'string') return { title: '', text: input.trim() };
  return { title: (input.title || '').trim(), text: input.text.trim() };
}

async function upsertIngredient(tx, name) {
  await tx.execute({
    sql: 'INSERT INTO ingredients (name) VALUES (?) ON CONFLICT (name) DO NOTHING',
    args: [name],
  });
  const row = await tx.execute({ sql: 'SELECT id FROM ingredients WHERE name = ?', args: [name] });
  return Number(row.rows[0].id);
}

async function replaceRecipeIngredients(tx, recipeId, ingredientInputs) {
  await tx.execute({ sql: 'DELETE FROM recipe_ingredients WHERE recipe_id = ?', args: [recipeId] });
  const seen = new Set();
  let position = 0;
  for (const input of ingredientInputs) {
    const parsed = parseIngredient(input);
    if (!parsed.name || seen.has(parsed.name)) continue;
    seen.add(parsed.name);
    const ingredientId = await upsertIngredient(tx, parsed.name);
    await tx.execute({
      sql: `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, display_text, quantity, unit, position)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [recipeId, ingredientId, parsed.displayText, parsed.quantity, parsed.unit, position],
    });
    position += 1;
  }
}

// ---------------------------------------------------------------------------
// Slug / presentation helpers
// ---------------------------------------------------------------------------

async function uniqueSlug(tx, title, ignoreId = null) {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;
  // Loop is bounded in practice; a recipe title has few collisions.
  for (;;) {
    const row = await tx.execute({
      sql: 'SELECT id FROM recipes WHERE slug = ?',
      args: [candidate],
    });
    const clash = row.rows[0];
    if (!clash || (ignoreId && Number(clash.id) === Number(ignoreId))) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

// ---------------------------------------------------------------------------
// Serialisation - the shape the React app consumes
// ---------------------------------------------------------------------------

function readJson(text, fallback) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function serializeRecipe(row, { ingredients = [], isFavourite = false, canManage = false } = {}) {
  const dietaryInfo = readJson(row.dietary_info, []);
  const instructions = readJson(row.instructions, []);
  const category = row.category_id
    ? { id: row.category_id, name: row.category_name, slug: row.category_slug, emoji: row.category_emoji }
    : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    image: row.image_url,
    imageUrl: row.image_url,
    cookingTimeMinutes: row.cooking_time_minutes,
    time: row.cooking_time_minutes ? `${row.cooking_time_minutes} min` : null,
    difficulty: row.difficulty,
    servings: row.servings,
    dietaryInfo,
    tags: [category?.name, ...dietaryInfo].filter(Boolean),
    category,
    rating: Number(row.rating_avg || 0).toFixed(1),
    ratingAvg: Number(row.rating_avg || 0),
    ratingCount: Number(row.rating_count || 0),
    viewsCount: Number(row.views_count || 0),
    ingredients,
    instructions,
    steps: instructions,
    author: row.author_id ? { id: row.author_id, name: row.author_name } : null,
    status: row.status,
    isPublished: Boolean(row.is_published),
    isFavourite,
    canManage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const RECIPE_SELECT = `
  SELECT r.*,
         c.name  AS category_name,
         c.slug  AS category_slug,
         c.emoji AS category_emoji,
         u.name  AS author_name
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN users u      ON u.id = r.author_id`;

async function loadIngredientTexts(recipeId) {
  const rows = await queryAll(
    `SELECT ri.display_text
       FROM recipe_ingredients ri
      WHERE ri.recipe_id = ?
      ORDER BY ri.position, ri.id`,
    [recipeId]
  );
  return rows.map((row) => row.display_text);
}

/** Reusable for any query that returns rows using RECIPE_SELECT. */
export const RECIPE_SELECT_SQL = RECIPE_SELECT;

export async function serializeRecipeRows(rows, auth = null) {
  return Promise.all(
    rows.map(async (row) => {
      const ingredients = await loadIngredientTexts(row.id);
      const isFavourite = await isFavouriteFor(auth?.id, row.id);
      return serializeRecipe(row, {
        ingredients,
        isFavourite,
        canManage: canManageRecipe(auth, row),
      });
    })
  );
}

async function isFavouriteFor(userId, recipeId) {
  if (!userId) return false;
  const row = await queryOne('SELECT id FROM favourites WHERE user_id = ? AND recipe_id = ?', [
    userId,
    recipeId,
  ]);
  return Boolean(row);
}

function canManageRecipe(auth, row) {
  if (!auth) return false;
  if (auth.role === 'admin' || auth.role === 'security_admin') return true;
  return auth.id && Number(row.author_id) === Number(auth.id);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function findRecipeByIdOrSlug(idOrSlug) {
  const asNumber = Number(idOrSlug);
  const row = Number.isInteger(asNumber) && asNumber > 0
    ? await queryOne(`${RECIPE_SELECT} WHERE r.id = ?`, [asNumber])
    : await queryOne(`${RECIPE_SELECT} WHERE r.slug = ?`, [idOrSlug]);
  return row;
}

export async function getRecipe(idOrSlug, { auth = null, incrementViews = false } = {}) {
  const row = await findRecipeByIdOrSlug(idOrSlug);
  if (!row) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

  const isOwnerOrAdmin = canManageRecipe(auth, row);
  if ((!row.is_published || row.status !== 'published') && !isOwnerOrAdmin) {
    throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');
  }

  if (incrementViews) {
    await execute('UPDATE recipes SET views_count = views_count + 1 WHERE id = ?', [row.id]);
    row.views_count = Number(row.views_count) + 1;
  }

  const [ingredients, isFavourite] = await Promise.all([
    loadIngredientTexts(row.id),
    isFavouriteFor(auth?.id, row.id),
  ]);

  return serializeRecipe(row, { ingredients, isFavourite, canManage: isOwnerOrAdmin });
}

export async function listRecipes(filters, pagination, { auth = null } = {}) {
  const where = [];
  const params = [];

  // Visibility: published recipes for everyone; owners/admins may also ask for their drafts.
  const wantsUnpublished = filters.includeUnpublished === 'true';
  const privileged = auth && (auth.role === 'admin' || auth.role === 'security_admin');
  if (wantsUnpublished && (privileged || auth?.id)) {
    if (privileged) {
      // admins see everything
    } else {
      where.push('r.author_id = ?');
      params.push(auth.id);
    }
  } else {
    where.push("r.is_published = 1 AND r.status = 'published'");
  }

  if (filters.q) {
    where.push(`(r.title LIKE ? OR r.description LIKE ? OR c.name LIKE ? OR EXISTS (
      SELECT 1 FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = r.id AND i.name LIKE ?
    ))`);
    const term = `%${filters.q}%`;
    params.push(term, term, term, term);
  }
  if (filters.category) {
    where.push('c.slug = ?');
    params.push(filters.category);
  }
  if (filters.difficulty) {
    where.push('r.difficulty = ?');
    params.push(filters.difficulty);
  }
  if (filters.maxTime) {
    where.push('r.cooking_time_minutes IS NOT NULL AND r.cooking_time_minutes <= ?');
    params.push(filters.maxTime);
  }
  if (filters.minTime) {
    where.push('r.cooking_time_minutes IS NOT NULL AND r.cooking_time_minutes >= ?');
    params.push(filters.minTime);
  }
  if (filters.dietary) {
    where.push('r.dietary_info LIKE ?');
    params.push(`%"${filters.dietary}"%`);
  }
  if (filters.authorId) {
    where.push('r.author_id = ?');
    params.push(filters.authorId);
  }
  if (filters.ingredient) {
    where.push(
      `EXISTS (SELECT 1 FROM recipe_ingredients ri
                 JOIN ingredients i ON i.id = ri.ingredient_id
                WHERE ri.recipe_id = r.id AND i.name LIKE ?)`
    );
    params.push(`%${filters.ingredient.toLowerCase()}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortMap = {
    newest: 'r.created_at DESC, r.id DESC',
    oldest: 'r.created_at ASC, r.id ASC',
    rating: 'r.rating_avg DESC, r.rating_count DESC',
    time: 'r.cooking_time_minutes ASC',
    popular: 'r.views_count DESC, r.rating_avg DESC',
    title: 'r.title ASC',
  };
  const orderSql = sortMap[filters.sort] || sortMap.newest;

  const countRow = await queryOne(
    `SELECT COUNT(*) AS count FROM recipes r LEFT JOIN categories c ON c.id = r.category_id ${whereSql}`,
    params
  );

  const rows = await queryAll(
    `${RECIPE_SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...params, pagination.limit, pagination.offset]
  );

  const items = await Promise.all(
    rows.map(async (row) => {
      const ingredients = await loadIngredientTexts(row.id);
      const isFavourite = await isFavouriteFor(auth?.id, row.id);
      return serializeRecipe(row, { ingredients, isFavourite, canManage: canManageRecipe(auth, row) });
    })
  );

  return { items, total: countRow.count };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function resolveCategoryId(tx, { categoryId, categorySlug }) {
  if (categoryId) {
    const row = await tx.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [categoryId] });
    return row.rows.length ? Number(row.rows[0].id) : null;
  }
  if (categorySlug) {
    const row = await tx.execute({
      sql: 'SELECT id FROM categories WHERE slug = ?',
      args: [String(categorySlug).toLowerCase()],
    });
    return row.rows.length ? Number(row.rows[0].id) : null;
  }
  return null;
}

export async function createRecipe(authorId, data) {
  const instructions = (data.instructions || data.steps || []).map(normalizeInstruction);
  const dietaryInfo = data.dietaryInfo || [];
  const cookingTime =
    data.cookingTimeMinutes ??
    (data.time ? Number.parseInt(String(data.time).replace(/[^0-9]/g, ''), 10) || null : null);

  const recipeId = await withTransaction(async (tx) => {
    const slug = await uniqueSlug(tx, data.title);
    const categoryId = await resolveCategoryId(tx, data);
    const status = data.status || 'published';
    const isPublished = data.isPublished !== undefined ? (data.isPublished ? 1 : 0) : status === 'published' ? 1 : 0;

    const result = await tx.execute({
      sql: `INSERT INTO recipes
              (slug, title, description, category_id, author_id, image_url, cooking_time_minutes,
               difficulty, servings, dietary_info, instructions, status, is_published)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        slug,
        data.title,
        data.description ?? null,
        categoryId,
        authorId,
        data.imageUrl ?? null,
        cookingTime,
        data.difficulty ?? null,
        data.servings ?? null,
        JSON.stringify(dietaryInfo),
        JSON.stringify(instructions),
        status,
        isPublished,
      ],
    });

    const id = Number(result.lastInsertRowid);
    if (data.ingredients?.length) await replaceRecipeIngredients(tx, id, data.ingredients);
    return id;
  });

  return getRecipe(recipeId, { incrementViews: false });
}

export async function updateRecipe(id, data) {
  const instructions = data.instructions || data.steps;

  await withTransaction(async (tx) => {
    const existing = await tx.execute({ sql: 'SELECT * FROM recipes WHERE id = ?', args: [id] });
    if (!existing.rows.length) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');
    const current = existing.rows[0];

    const sets = [];
    const args = [];
    const push = (column, value) => {
      sets.push(`${column} = ?`);
      args.push(value);
    };

    if (data.title !== undefined && data.title !== current.title) {
      push('title', data.title);
      push('slug', await uniqueSlug(tx, data.title, id));
    }
    if (data.description !== undefined) push('description', data.description);
    if (data.categoryId !== undefined || data.categorySlug !== undefined) {
      push('category_id', await resolveCategoryId(tx, data));
    }
    if (data.imageUrl !== undefined) push('image_url', data.imageUrl);
    if (data.cookingTimeMinutes !== undefined) push('cooking_time_minutes', data.cookingTimeMinutes);
    if (data.time !== undefined && data.cookingTimeMinutes === undefined) {
      push('cooking_time_minutes', Number.parseInt(String(data.time).replace(/[^0-9]/g, ''), 10) || null);
    }
    if (data.difficulty !== undefined) push('difficulty', data.difficulty);
    if (data.servings !== undefined) push('servings', data.servings);
    if (data.dietaryInfo !== undefined) push('dietary_info', JSON.stringify(data.dietaryInfo));
    if (instructions !== undefined) {
      push('instructions', JSON.stringify(instructions.map(normalizeInstruction)));
    }
    if (data.status !== undefined) push('status', data.status);
    if (data.isPublished !== undefined) push('is_published', data.isPublished ? 1 : 0);

    if (sets.length) {
      await tx.execute({
        sql: `UPDATE recipes SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        args: [...args, id],
      });
    }

    if (data.ingredients !== undefined) await replaceRecipeIngredients(tx, id, data.ingredients);
  });

  return getRecipe(id, { incrementViews: false });
}

export async function deleteRecipe(id) {
  const row = await queryOne('SELECT id FROM recipes WHERE id = ?', [id]);
  if (!row) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');
  await execute('DELETE FROM recipes WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Aggregate maintenance
// ---------------------------------------------------------------------------

/** Recomputes the denormalised rating_avg / rating_count on a recipe. */
export async function recalcRecipeRating(recipeId) {
  const row = await queryOne(
    'SELECT AVG(rating) AS avg, COUNT(*) AS count FROM ratings WHERE recipe_id = ?',
    [recipeId]
  );
  const avg = row && row.count ? Number(row.avg) : 0;
  await execute('UPDATE recipes SET rating_avg = ?, rating_count = ? WHERE id = ?', [
    avg,
    row ? Number(row.count) : 0,
    recipeId,
  ]);
  return { avg, count: row ? Number(row.count) : 0 };
}

export async function findRecipeAuthor(id) {
  return queryOne('SELECT id, author_id, title, is_published, status FROM recipes WHERE id = ?', [id]);
}

import { execute, queryAll, queryOne, withTransaction } from '../config/database.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';
import { recalcRecipeRating, serializeRecipeRows, RECIPE_SELECT_SQL } from './recipeService.js';

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

export async function addFavourite(userId, recipeId) {
  await withTransaction(async (tx) => {
    const recipe = await tx.execute({ sql: 'SELECT id FROM recipes WHERE id = ?', args: [recipeId] });
    if (!recipe.rows.length) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

    const alreadySaved = await tx.execute({ sql: 'SELECT id FROM favourites WHERE user_id = ? AND recipe_id = ?', args: [userId, recipeId] });
    if (!alreadySaved.rows.length) {
      const count = await tx.execute({ sql: 'SELECT COUNT(*) AS count FROM favourites WHERE user_id = ?', args: [userId] });
      if (Number(count.rows[0]?.count || 0) >= 250) {
        throw conflict('Saved recipe storage is full (500 MB). Remove a saved recipe to make room.', 'STORAGE_LIMIT_REACHED');
      }
    }

    // ON CONFLICT keeps this idempotent - no duplicate favourites, no error spam.
    await tx.execute({
      sql: 'INSERT INTO favourites (user_id, recipe_id) VALUES (?, ?) ON CONFLICT (user_id, recipe_id) DO NOTHING',
      args: [userId, recipeId],
    });
  });
  return { recipeId, isFavourite: true };
}

export async function removeFavourite(userId, recipeId) {
  await execute('DELETE FROM favourites WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
  return { recipeId, isFavourite: false };
}

export async function listFavourites(userId, pagination) {
  const countRow = await queryOne('SELECT COUNT(*) AS count FROM favourites WHERE user_id = ?', [userId]);
  const rows = await queryAll(
    `${RECIPE_SELECT_SQL}
      JOIN favourites f ON f.recipe_id = r.id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT ? OFFSET ?`,
    [userId, pagination.limit, pagination.offset]
  );
  const items = await serializeRecipeRows(rows, { id: userId, role: 'user' });
  return { items, total: countRow.count };
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

export async function rateRecipe(userId, recipeId, rating) {
  const recipe = await queryOne('SELECT id FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

  // One rating per user per recipe: re-rating updates the existing row.
  await execute(
    `INSERT INTO ratings (user_id, recipe_id, rating) VALUES (?, ?, ?)
     ON CONFLICT (user_id, recipe_id)
     DO UPDATE SET rating = excluded.rating, updated_at = datetime('now')`,
    [userId, recipeId, rating]
  );
  const summary = await recalcRecipeRating(recipeId);
  return { recipeId, rating, ratingAvg: summary.avg, ratingCount: summary.count };
}

export async function getUserRating(userId, recipeId) {
  const row = await queryOne('SELECT rating, updated_at FROM ratings WHERE user_id = ? AND recipe_id = ?', [
    userId,
    recipeId,
  ]);
  return row || null;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

const REVIEW_SELECT = `
  SELECT rv.id, rv.recipe_id, rv.user_id, rv.body, rv.created_at, rv.updated_at,
         u.name AS author_name
    FROM reviews rv
    JOIN users u ON u.id = rv.user_id`;

export async function listReviews(recipeId, pagination) {
  const countRow = await queryOne(
    'SELECT COUNT(*) AS count FROM reviews WHERE recipe_id = ? AND is_hidden = 0',
    [recipeId]
  );
  const items = await queryAll(
    `${REVIEW_SELECT} WHERE rv.recipe_id = ? AND rv.is_hidden = 0
      ORDER BY rv.created_at DESC, rv.id DESC LIMIT ? OFFSET ?`,
    [recipeId, pagination.limit, pagination.offset]
  );
  return {
    items: items.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      userId: row.user_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    total: countRow.count,
  };
}

export async function createReview(userId, recipeId, body, rating = null) {
  const recipe = await queryOne('SELECT id FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

  const result = await execute(
    'INSERT INTO reviews (user_id, recipe_id, body) VALUES (?, ?, ?)',
    [userId, recipeId, body]
  );
  // A review may optionally carry a rating; reuse the single-rating rule.
  if (rating) await rateRecipe(userId, recipeId, rating);

  const row = await queryOne(`${REVIEW_SELECT} WHERE rv.id = ?`, [Number(result.lastInsertRowid)]);
  return {
    id: row.id,
    recipeId: row.recipe_id,
    userId: row.user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateReview(auth, reviewId, body) {
  const row = await queryOne('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  if (!row) throw notFound('Review not found', 'REVIEW_NOT_FOUND');
  if (Number(row.user_id) !== Number(auth.id) && !auth.permissions.includes('review:update:any')) {
    throw forbidden('You can only edit your own reviews.', 'REVIEW_NOT_OWNED');
  }
  await execute("UPDATE reviews SET body = ?, updated_at = datetime('now') WHERE id = ?", [body, reviewId]);
  const updated = await queryOne(`${REVIEW_SELECT} WHERE rv.id = ?`, [reviewId]);
  return {
    id: updated.id,
    recipeId: updated.recipe_id,
    userId: updated.user_id,
    authorName: updated.author_name,
    body: updated.body,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

export async function deleteReview(auth, reviewId) {
  const row = await queryOne('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  if (!row) throw notFound('Review not found', 'REVIEW_NOT_FOUND');
  if (Number(row.user_id) !== Number(auth.id) && !auth.permissions.includes('review:delete:any')) {
    throw forbidden('You can only delete your own reviews.', 'REVIEW_NOT_OWNED');
  }
  await execute('DELETE FROM reviews WHERE id = ?', [reviewId]);
}

// ---------------------------------------------------------------------------
// Cooking history
// ---------------------------------------------------------------------------

export async function addCookingHistory(userId, recipeId, { servings = null, notes = null } = {}) {
  const recipe = await queryOne('SELECT id FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');

  const result = await execute(
    'INSERT INTO cooking_history (user_id, recipe_id, servings, notes) VALUES (?, ?, ?, ?)',
    [userId, recipeId, servings, notes]
  );
  const row = await queryOne(
    `SELECT ch.id, ch.recipe_id, ch.cooked_at, ch.servings, ch.notes, r.title, r.image_url
       FROM cooking_history ch JOIN recipes r ON r.id = ch.recipe_id
      WHERE ch.id = ?`,
    [Number(result.lastInsertRowid)]
  );
  return {
    id: row.id,
    recipeId: row.recipe_id,
    recipeTitle: row.title,
    imageUrl: row.image_url,
    cookedAt: row.cooked_at,
    servings: row.servings,
    notes: row.notes,
  };
}

export async function listCookingHistory(userId, pagination) {
  const countRow = await queryOne('SELECT COUNT(*) AS count FROM cooking_history WHERE user_id = ?', [userId]);
  const rows = await queryAll(
    `SELECT ch.id, ch.recipe_id, ch.cooked_at, ch.servings, ch.notes, r.title, r.image_url
       FROM cooking_history ch JOIN recipes r ON r.id = ch.recipe_id
      WHERE ch.user_id = ?
      ORDER BY ch.cooked_at DESC, ch.id DESC
      LIMIT ? OFFSET ?`,
    [userId, pagination.limit, pagination.offset]
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      recipeTitle: row.title,
      imageUrl: row.image_url,
      cookedAt: row.cooked_at,
      servings: row.servings,
      notes: row.notes,
    })),
    total: countRow.count,
  };
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

function serializePreferences(row) {
  let dietaryPreferences = [];
  try {
    dietaryPreferences = JSON.parse(row.dietary_preferences || '[]');
  } catch {
    dietaryPreferences = [];
  }
  return {
    dietaryPreferences,
    theme: row.theme,
    language: row.language,
    measurementUnits: row.measurement_units,
    emailNotifications: Boolean(row.email_notifications),
    updatedAt: row.updated_at,
  };
}

export async function getPreferences(userId) {
  let row = await queryOne('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
  if (!row) {
    await execute(
      'INSERT INTO user_preferences (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    row = await queryOne('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
  }
  return serializePreferences(row);
}

export async function updatePreferences(userId, data) {
  await getPreferences(userId); // ensures a row exists

  const sets = [];
  const args = [];
  if (data.dietaryPreferences !== undefined) {
    sets.push('dietary_preferences = ?');
    args.push(JSON.stringify(data.dietaryPreferences));
  }
  if (data.theme !== undefined) {
    sets.push('theme = ?');
    args.push(data.theme);
  }
  if (data.language !== undefined) {
    sets.push('language = ?');
    args.push(data.language);
  }
  if (data.measurementUnits !== undefined) {
    sets.push('measurement_units = ?');
    args.push(data.measurementUnits);
  }
  if (data.emailNotifications !== undefined) {
    sets.push('email_notifications = ?');
    args.push(data.emailNotifications ? 1 : 0);
  }

  if (sets.length) {
    await execute(
      `UPDATE user_preferences SET ${sets.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`,
      [...args, userId]
    );
  }
  const row = await queryOne('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
  return serializePreferences(row);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** Records a view (used by the explicit POST /recipes/:id/view endpoint). */
export async function recordView(recipeId) {
  const recipe = await queryOne('SELECT id, views_count FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) throw notFound('Recipe not found', 'RECIPE_NOT_FOUND');
  await execute('UPDATE recipes SET views_count = views_count + 1 WHERE id = ?', [recipeId]);
  return { recipeId, viewsCount: Number(recipe.views_count) + 1 };
}

/** Read-only, schema-aware RecipeHub export for AI training. No user PII or auth fields are selected. */
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/config/database.js';
import { config } from '../src/config/env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ai/datasets/processed');
const tableNames = new Set((await db.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((row) => row.name));
const hasTable = (name) => tableNames.has(name);
const pseudonym = (id) => id == null ? '' : `rh:${createHmac('sha256', config.jwt.secret).update(`recipehub-user:${id}`).digest('hex').slice(0, 32)}`;
const jsonArray = (value) => { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };

try {
  if (!hasTable('recipes')) throw new Error('Turso database does not contain the recipes table.');
  const recipeResult = await db.execute(`SELECT r.id,r.title,r.description,r.cooking_time_minutes,r.dietary_info,r.instructions,r.category_id${hasTable('categories') ? ',c.name AS category_name' : ''} FROM recipes r${hasTable('categories') ? ' LEFT JOIN categories c ON c.id=r.category_id' : ''}`);
  const ingredientResult = hasTable('recipe_ingredients') ? await db.execute('SELECT recipe_id,display_text,position FROM recipe_ingredients ORDER BY recipe_id,position') : { rows: [] };
  const ingredientsByRecipe = new Map();
  for (const row of ingredientResult.rows) {
    const key = String(row.recipe_id);
    if (!ingredientsByRecipe.has(key)) ingredientsByRecipe.set(key, []);
    ingredientsByRecipe.get(key).push(row.display_text);
  }
  const recipes = recipeResult.rows.map((row) => {
    const dietary = jsonArray(row.dietary_info);
    const steps = jsonArray(row.instructions);
    const ingredients = ingredientsByRecipe.get(String(row.id)) || [];
    const tags = [...dietary, ...(row.category_name ? [row.category_name] : [])];
    return { source: 'recipehub', source_recipe_id: String(row.id), recipe_id: `recipehub:${row.id}`, title: row.title || '', minutes: row.cooking_time_minutes, description: row.description || '', ingredients, tags, category: row.category_name || 'Uncategorized', n_ingredients: ingredients.length, n_steps: steps.length, nutrition: [] };
  });
  const recipeIds = new Set(recipes.map((row) => row.recipe_id));
  const interactions = [];
  const addEvents = async (table, sql, eventType, getRating = () => '') => {
    if (!hasTable(table)) return;
    for (const row of (await db.execute(sql)).rows) {
      const recipeId = `recipehub:${row.recipe_id}`;
      if (!recipeIds.has(recipeId)) continue;
      interactions.push({ source: 'recipehub', source_user_id: '', user_id: pseudonym(row.user_id), recipe_id: recipeId, event_date: row.event_date || '', rating: getRating(row), interaction_type: eventType, has_review: false });
    }
  };
  await addEvents('ratings', 'SELECT user_id,recipe_id,rating,created_at AS event_date FROM ratings', 'rating', (row) => row.rating);
  await addEvents('favourites', 'SELECT user_id,recipe_id,created_at AS event_date FROM favourites', 'favourite');
  await addEvents('cooking_history', 'SELECT user_id,recipe_id,cooked_at AS event_date FROM cooking_history', 'cooked');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'recipehub_recipes.json'), JSON.stringify(recipes), 'utf8');
  await fs.writeFile(path.join(root, 'recipehub_interactions.json'), JSON.stringify(interactions), 'utf8');
  console.log(`Exported ${recipes.length} recipes and ${interactions.length} pseudonymised interaction rows from available Turso tables.`);
  console.log(`Available source tables: ${['recipes','recipe_ingredients','categories','ratings','favourites','cooking_history'].filter(hasTable).join(', ')}`);
} finally {
  await db.close();
}

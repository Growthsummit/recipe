import { queryAll, queryOne } from '../config/database.js';
export { canonicaliseRecipe, canonicalRecipeJson, sha256Recipe } from './canonicalRecipeContent.js';

export async function getCanonicalRecipe(recipeId) {
  const recipe = await queryOne(
    `SELECT r.id,r.title,r.description,r.image_url,r.cooking_time_minutes,r.difficulty,r.servings,
            r.dietary_info,r.instructions,r.status,r.is_published,r.author_id,c.slug AS category_slug
       FROM recipes r LEFT JOIN categories c ON c.id=r.category_id WHERE r.id=?`,
    [recipeId]
  );
  if (!recipe) return null;
  const ingredients = await queryAll(
    `SELECT display_text,quantity,unit FROM recipe_ingredients WHERE recipe_id=? ORDER BY position,id`,
    [recipeId]
  );
  return { ...recipe, ingredients };
}

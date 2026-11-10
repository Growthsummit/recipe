// Simulates someone altering a recipe directly in the database (bypassing the app),
// so you can show that the blockchain verification detects it.
//
//   node blockchain/scripts/tamperRecipe.js tamper            -> sets cooking time to 99
//   node blockchain/scripts/tamperRecipe.js restore <minutes> -> puts the original value back
//
// Run from the backend folder. Targets the recipe titled "Papa and Moroho".
import { execute, queryOne } from '../../src/config/database.js';

const TITLE = 'Papa and Moroho';
const [, , action, value] = process.argv;

const recipe = await queryOne('SELECT id,cooking_time_minutes AS minutes FROM recipes WHERE title=? ORDER BY id DESC LIMIT 1', [TITLE]);
if (!recipe) { console.error(`No recipe titled "${TITLE}" found.`); process.exit(1); }

if (action === 'tamper') {
  await execute('UPDATE recipes SET cooking_time_minutes=99 WHERE id=?', [recipe.id]);
  console.log(`Recipe ${recipe.id}: cooking time changed from ${recipe.minutes} to 99 directly in the database.`);
  console.log(`To undo it later run: node blockchain/scripts/tamperRecipe.js restore ${recipe.minutes}`);
} else if (action === 'restore' && Number.isInteger(Number(value))) {
  await execute('UPDATE recipes SET cooking_time_minutes=? WHERE id=?', [Number(value), recipe.id]);
  console.log(`Recipe ${recipe.id}: cooking time restored to ${value}.`);
} else {
  console.log('Usage: node blockchain/scripts/tamperRecipe.js tamper | restore <minutes>');
}
process.exit(0);

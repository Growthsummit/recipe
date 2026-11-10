/**
 * Idempotent seed script.
 *
 * - Creates (once) the seed accounts: an author, an Administrator and a Security Administrator.
 * - Creates (once) the eight categories.
 * - Creates (once) the 14 original RecipeBox recipes.
 *
 * Nothing is ever overwritten: every insert is guarded by an existence check,
 * so re-running this script (or editing a recipe in the app) is safe.
 *
 * Usage:  npm run seed
 */
import { randomBytes } from 'node:crypto';
import { queryOne, db } from '../src/config/database.js';
import { config } from '../src/config/env.js';
import { hashPassword } from '../src/utils/password.js';
import { createUser, findUserByEmail } from '../src/services/userService.js';
import { ensureCategory } from '../src/services/categoryService.js';
import { createRecipe } from '../src/services/recipeService.js';
import { SEED_CATEGORIES, SEED_RECIPES } from './seedData.js';

async function ensureUser({ name, email, password, role }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  [skip] bootstrap account already exists (${existing.role}).`);
    return existing;
  }
  const user = await createUser({ name, email, passwordHash: await hashPassword(password), role });
  console.log(`  [new ] bootstrap account created (${role}).`);
  return user;
}

async function main() {
  console.log('Seeding RecipeBox database (existing rows are never modified)\n');

  // Guard: the schema must exist first.
  const schemaReady = await queryOne(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'recipes'"
  );
  if (!schemaReady || schemaReady.count !== 1) {
    throw new Error('Tables are missing. Run "npm run init-db" first.');
  }

  console.log('Accounts:');
  const author = await ensureUser({
    name: 'RecipeBox Kitchen',
    email: 'kitchen@recipebox.local',
    password: randomBytes(18).toString('hex'),
    role: 'user',
  });
  if (config.seedAdmin.email && config.seedAdmin.password) await ensureUser({ ...config.seedAdmin, role: 'admin' });
  else console.log('  [skip] Administrator bootstrap: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD first.');
  if (config.seedSecurityAdmin.email && config.seedSecurityAdmin.password) await ensureUser({ ...config.seedSecurityAdmin, role: 'security_admin' });
  else console.log('  [skip] Security Administrator bootstrap: set SEED_SECURITY_EMAIL and SEED_SECURITY_PASSWORD first.');

  console.log('\nCategories:');
  const categoryIds = {};
  for (const category of SEED_CATEGORIES) {
    const row = await ensureCategory(category.name, category.emoji);
    categoryIds[category.name] = row.id;
    console.log(`  [ok  ] ${category.name}`);
  }

  console.log('\nRecipes:');
  let created = 0;
  for (const recipe of SEED_RECIPES) {
    const existing = await queryOne('SELECT id FROM recipes WHERE slug = ?', [recipe.slug]);
    if (existing) {
      console.log(`  [skip] recipe already exists: ${recipe.title}`);
      continue;
    }
    const saved = await createRecipe(author.id, {
      title: recipe.title,
      description: recipe.description,
      categoryId: categoryIds[recipe.category] ?? null,
      imageUrl: `/images/recipes/${recipe.slug}.png`,
      cookingTimeMinutes: recipe.cookingTimeMinutes,
      difficulty: recipe.difficulty,
      servings: recipe.servings,
      dietaryInfo: recipe.dietaryInfo,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      status: 'published',
      isPublished: true,
    });
    created += 1;
    console.log(`  [new ] ${saved.title}`);
  }

  console.log(`\nDone. ${created} new recipe(s) inserted.`);
  console.log('Bootstrap accounts are configured only through backend/.env; passwords are never printed.');
  db.close();
}

main().catch((error) => {
  console.error('\nSeeding failed:');
  console.error(error);
  process.exit(1);
});

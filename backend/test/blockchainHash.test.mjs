import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRecipeJson, sha256Recipe } from '../src/blockchain/canonicalRecipeContent.js';

const recipe = {
  title: '  Spinach   Pasta ',
  description: 'A quick\r\n weekday meal. ',
  categorySlug: 'PASTA',
  imageUrl: ' https://images.example.invalid/pasta.jpg ',
  cookingTimeMinutes: 25,
  difficulty: 'Easy',
  servings: 'Serves 2',
  dietaryInfo: ['Vegetarian', 'Gluten-free'],
  ingredients: ['2 cups Spinach', '100 g pasta'],
  instructions: [{ title: 'Boil   pasta', text: 'Cook it\r\n until tender.' }],
};

test('canonical recipe hash is 32-byte SHA-256 and deterministic', () => {
  const first = sha256Recipe(recipe);
  assert.match(first, /^0x[0-9a-f]{64}$/);
  assert.equal(sha256Recipe(recipe), first);
});

test('canonicalisation normalises whitespace, tag ordering and ingredient units', () => {
  const equivalent = {
    ...recipe,
    title: 'Spinach Pasta',
    description: 'A quick weekday meal.',
    categorySlug: 'pasta',
    dietaryInfo: ['gluten-free', 'vegetarian'],
    ingredients: [
      { name: 'spinach', quantity: '2', unit: 'CUP' },
      { name: 'Pasta', quantity: '100', unit: 'GRAMS' },
    ],
    instructions: [{ title: 'Boil pasta', text: 'Cook it until tender.' }],
  };
  assert.equal(canonicalRecipeJson(equivalent), canonicalRecipeJson(recipe));
  assert.equal(sha256Recipe(equivalent), sha256Recipe(recipe));
});

test('important recipe content changes produce a different digest', () => {
  assert.notEqual(sha256Recipe({ ...recipe, description: 'A changed description.' }), sha256Recipe(recipe));
  assert.notEqual(sha256Recipe({ ...recipe, ingredients: ['3 cups Spinach', '100 g pasta'] }), sha256Recipe(recipe));
  assert.notEqual(sha256Recipe({ ...recipe, instructions: [{ title: 'Boil pasta', text: 'Do not cook it.' }] }), sha256Recipe(recipe));
});

test('database IDs and UI-only fields are excluded from the content digest', () => {
  assert.equal(sha256Recipe({ ...recipe, id: 99, authorId: 400, isFavourite: true, imageLoading: false }), sha256Recipe(recipe));
});

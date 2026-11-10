import { createHash } from 'node:crypto';

const normaliseText = (value) => String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\s\u00a0]+/g, ' ').trim();
const normaliseUnit = (value) => {
  const unit = normaliseText(value).toLocaleLowerCase('en-US').replace(/\.$/, '');
  const aliases = {
    cups: 'cup', tablespoons: 'tbsp', tablespoon: 'tbsp', tbsps: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp',
    teaspoons: 'tsp', teaspoon: 'tsp', tsps: 'tsp', tsp: 'tsp', grams: 'g', gram: 'g',
    kilograms: 'kg', kilogram: 'kg', milliliters: 'ml', millilitres: 'ml', milliliter: 'ml', millilitre: 'ml',
    liters: 'l', litres: 'l', liter: 'l', litre: 'l', ounces: 'oz', ounce: 'oz', pounds: 'lb', pound: 'lb',
    cloves: 'clove', slices: 'slice', pieces: 'piece', cans: 'can', pinches: 'pinch', bunches: 'bunch',
  };
  return Object.hasOwn(aliases, unit) ? aliases[unit] : unit;
};
const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
};
function parseIngredient(displayText) {
  const text = normaliseText(displayText);
  const match = text.match(/^([\d½¼¾⅓⅔.,/\s-]+)\s*([a-zA-Z%]{1,20})?\.?\s+(.+)$/);
  if (!match) return { name: text.toLocaleLowerCase('en-US'), quantity: null, unit: null };
  return { quantity: normaliseText(match[1]).replace(/\s+/g, ''), unit: normaliseUnit(match[2]), name: normaliseText(match[3]).toLocaleLowerCase('en-US') };
}

export function canonicaliseRecipe(recipe) {
  const dietaryInfo = parseArray(recipe.dietaryInfo ?? recipe.dietary_info)
    .map((item) => normaliseText(item).toLocaleLowerCase('en-US'))
    .filter(Boolean)
    .sort();
  const ingredients = (recipe.ingredients || [])
    .map((item) => typeof item === 'string' ? { displayText: item } : item)
    .map((item) => {
      const displayText = normaliseText(item.displayText ?? item.display_text ?? item.name);
      const parsed = parseIngredient(displayText);
      return {
        name: normaliseText(item.name || parsed.name).toLocaleLowerCase('en-US'),
        quantity: normaliseText(item.quantity ?? parsed.quantity).replace(/\s+/g, ''),
        unit: normaliseUnit(item.unit ?? parsed.unit),
      };
    });
  const instructions = parseArray(recipe.instructions)
    .map((step) => typeof step === 'string' ? { title: '', text: step } : step)
    .map((step) => ({ title: normaliseText(step.title), text: normaliseText(step.text) }));

  // Fixed field order is deliberate. IDs, authors, ratings, counters, timestamps
  // and UI state are excluded so the digest represents recipe content only.
  return {
    schema: 'recipehub-recipe-v1',
    title: normaliseText(recipe.title),
    description: normaliseText(recipe.description),
    category: normaliseText(recipe.categorySlug ?? recipe.category_slug).toLocaleLowerCase('en-US'),
    imageUrl: normaliseText(recipe.imageUrl ?? recipe.image_url),
    cookingTimeMinutes: recipe.cookingTimeMinutes ?? recipe.cooking_time_minutes ?? null,
    difficulty: normaliseText(recipe.difficulty),
    servings: normaliseText(recipe.servings),
    dietaryInfo,
    ingredients,
    instructions,
  };
}

export function canonicalRecipeJson(recipe) {
  return JSON.stringify(canonicaliseRecipe(recipe));
}

export function sha256Recipe(recipe) {
  return `0x${createHash('sha256').update(canonicalRecipeJson(recipe), 'utf8').digest('hex')}`;
}

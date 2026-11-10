/**
 * Design-only recipe metadata.
 *
 * Recipe content itself now lives in the Turso database and is fetched through
 * `src/services/api.js`. What remains here is the small amount of information
 * that exists only in the Figma design and has no database column:
 *  - the order of the "Popular Recipes" row,
 *  - the two "Trending Recipes" cards (one of which is a design alias for a
 *    real recipe, documented in the README),
 *  - the four category tiles and their emoji,
 *  - per-recipe list styling (circle / disc / plain bullets, step labels).
 */

const asset = (slug) => `${import.meta.env.BASE_URL}images/recipes/${slug}.png`;

/** Home → "Popular Recipes" (the order used by the design). */
export const POPULAR_SLUGS = [
  'creamy-garlic-pasta',
  'chicken-and-rice',
  'margherita-pizza',
  'chocolate-brownies',
];

/** Search → "Trending Recipes". "Spicy Chicken Rice" has no detail screen in
 *  the Figma file; it opens the "Chicken and Rice" details (closest match). */
export const TRENDING = [
  {
    key: 'trending-spicy-chicken-rice',
    slug: 'chicken-and-rice',
    title: 'Spicy Chicken Rice',
    rating: '4.9',
    time: '35 min',
    image: asset('trending-spicy-chicken-rice'),
  },
  {
    key: 'trending-chocolate-brownies',
    slug: 'chocolate-brownies',
    title: 'Chocolate Brownies',
    rating: '4.8',
    time: '40 min',
    image: asset('trending-chocolate-brownies'),
  },
];

/** Category buttons/tiles. `query` is the text the search field shows. */
export const CATEGORIES = [
  { label: 'Pasta', emoji: '🍝', query: 'Pasta' },
  { label: 'Deserts', emoji: '🍰', query: 'Desserts' },
  { label: 'Healthy', emoji: '🥗', query: 'Healthy' },
  { label: 'Dinner', emoji: '🍲', query: 'Dinner' },
];

/** Per-recipe presentation details that the API does not carry. */
const PRESENTATION = {
  'creamy-garlic-pasta': { ingredientStyle: 'circle', stepLabels: true },
  'chicken-and-rice': { ingredientStyle: 'disc' },
};

export const presentationFor = (recipe) => PRESENTATION[recipe?.slug] || {};

/** Resolves the image for a recipe coming from the API. */
export const recipeImage = (recipe) => (recipe && (recipe.image || recipe.imageUrl)) || '';

/** Client-side text match used by the Home search field (title + tags). */
export function matches(recipe, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [recipe.title, recipe.category?.name, ...(recipe.tags || [])]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return haystack.some((value) => value.includes(q));
}

/** Picks the recipes for the "Popular Recipes" row, preserving design order. */
export function popularFrom(recipes) {
  const bySlug = new Map((recipes || []).map((r) => [r.slug, r]));
  return POPULAR_SLUGS.map((slug) => bySlug.get(slug)).filter(Boolean);
}

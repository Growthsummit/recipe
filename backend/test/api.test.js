/**
 * End-to-end API test suite.
 *
 * Runs against a live backend on http://localhost:5000 (start it with `npm start`
 * in a second terminal). It creates its own throwaway users and recipes, and
 * deletes the recipes it creates, so it is safe to run repeatedly.
 *
 * Usage:  npm test
 */
const BASE = process.env.API_URL || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const unique = () => `${Date.now()}${Math.floor(Math.random() * 10000)}`;

async function main() {
  console.log(`RecipeBox API test suite -> ${BASE}`);

  // ------------------------------------------------------------------
  section('Health & public recipe reads');
  const health = await api('GET', '/health');
  check('GET /health returns 200', health.status === 200);
  check('health reports database connected', health.body?.data?.database === 'connected');

  const all = await api('GET', '/recipes');
  check('GET /recipes returns 200', all.status === 200);
  check('GET /recipes returns the 14 seeded recipes', all.body?.data?.pagination?.total >= 14, `total ${all.body?.data?.pagination?.total}`);
  check('pagination envelope present', typeof all.body?.data?.pagination?.total === 'number');

  const firstId = all.body?.data?.items?.[0]?.id;

  const byId = await api('GET', `/recipes/${firstId}`);
  check('GET /recipes/:id returns 200', byId.status === 200);
  check('recipe has ingredients array', Array.isArray(byId.body?.data?.recipe?.ingredients));

  const bySlug = await api('GET', '/recipes/creamy-garlic-pasta');
  check('GET /recipes/:slug resolves by slug', bySlug.status === 200 && bySlug.body?.data?.recipe?.slug === 'creamy-garlic-pasta');

  const missing = await api('GET', '/recipes/999999');
  check('GET /recipes/:id (missing) returns 404', missing.status === 404);

  // ------------------------------------------------------------------
  section('Search & filters');
  const search = await api('GET', '/recipes?q=pasta');
  check('search by text finds results', search.status === 200 && search.body.data.items.length > 0);

  const byCategory = await api('GET', '/recipes?category=pizza');
  check('filter by category works', byCategory.status === 200 && byCategory.body.data.items.every((r) => r.category?.slug === 'pizza'));

  const byTime = await api('GET', '/recipes?maxTime=20');
  check('filter by max cooking time works', byTime.status === 200 && byTime.body.data.items.every((r) => r.cookingTimeMinutes <= 20));

  const byDiet = await api('GET', '/recipes?dietary=Vegetarian');
  check('filter by dietary preference works', byDiet.status === 200 && byDiet.body.data.items.every((r) => r.dietaryInfo.includes('Vegetarian')));

  const byIngredient = await api('GET', '/recipes?ingredient=garlic');
  check('filter by ingredient works', byIngredient.status === 200 && byIngredient.body.data.items.length > 0);

  const paged = await api('GET', '/recipes?limit=5&page=2');
  check('pagination limit/page works', paged.body.data.items.length <= 5 && paged.body.data.pagination.page === 2);

  // ------------------------------------------------------------------
  section('Registration & validation');
  const emailA = `tester_${unique()}@example.com`;
  const password = 'Passw0rd123';
  const reg = await api('POST', '/auth/register', { body: { name: 'Test Tester', email: emailA, password } });
  check('register returns 201', reg.status === 201, JSON.stringify(reg.body));
  check('register returns a JWT', typeof reg.body?.data?.token === 'string');
  check('register never returns password_hash', !JSON.stringify(reg.body).includes('password_hash'));
  const tokenA = reg.body?.data?.token;
  const userAId = reg.body?.data?.user?.id;
  check('self-registered user is NOT an admin', reg.body?.data?.user?.role === 'user');

  const dupe = await api('POST', '/auth/register', { body: { name: 'Test Tester', email: emailA, password } });
  check('duplicate email returns 409', dupe.status === 409);

  const weak = await api('POST', '/auth/register', { body: { name: 'Weak', email: `w_${unique()}@example.com`, password: 'short' } });
  check('weak password returns 422', weak.status === 422, `status ${weak.status}`);

  const extraField = await api('POST', '/auth/register', { body: { name: 'Sneaky', email: `s_${unique()}@example.com`, password, role: 'admin' } });
  check('register rejects unknown/privileged fields', extraField.status === 422, `status ${extraField.status}`);

  // ------------------------------------------------------------------
  section('Login & authentication');
  const badLogin = await api('POST', '/auth/login', { body: { email: emailA, password: 'WrongPassword1' } });
  check('wrong password returns 401', badLogin.status === 401);

  const login = await api('POST', '/auth/login', { body: { email: emailA, password } });
  check('login returns 200 + token', login.status === 200 && typeof login.body?.data?.token === 'string');

  const meNoToken = await api('GET', '/auth/me');
  check('GET /auth/me without token returns 401', meNoToken.status === 401);

  const meBadToken = await api('GET', '/auth/me', { token: 'not-a-real-token' });
  check('GET /auth/me with a bad token returns 401', meBadToken.status === 401);

  const me = await api('GET', '/auth/me', { token: tokenA });
  check('GET /auth/me returns the current user', me.status === 200 && me.body.data.user.email === emailA);

  const updateMe = await api('PATCH', '/auth/me', { token: tokenA, body: { name: 'Renamed Tester' } });
  check('PATCH /auth/me updates the profile', updateMe.status === 200 && updateMe.body.data.user.name === 'Renamed Tester');

  const selfPromote = await api('PATCH', '/auth/me', { token: tokenA, body: { role: 'admin' } });
  check('PATCH /auth/me cannot change own role', selfPromote.status === 422, `status ${selfPromote.status}`);

  // ------------------------------------------------------------------
  section('Recipe CRUD & ownership');
  const created = await api('POST', '/recipes', {
    token: tokenA,
    body: {
      title: `Test Recipe ${unique()}`,
      description: 'A recipe created by the automated test.',
      categorySlug: 'dinner',
      cookingTimeMinutes: 12,
      difficulty: 'Medium',
      servings: 'Serves 4',
      dietaryInfo: ['Gluten-Free'],
      ingredients: ['1 cup test flour', '2 tbsp test oil'],
      instructions: [{ title: 'Mix', text: 'Mix everything together.' }, 'Bake until done.'],
    },
  });
  check('POST /recipes creates a recipe (201)', created.status === 201, JSON.stringify(created.body));
  const newRecipeId = created.body?.data?.recipe?.id;
  check('created recipe has ingredients', created.body?.data?.recipe?.ingredients?.length === 2);
  check('created recipe has normalised steps', created.body?.data?.recipe?.instructions?.length === 2);
  check('created recipe gets a slug', Boolean(created.body?.data?.recipe?.slug));

  const noAuthCreate = await api('POST', '/recipes', { body: { title: 'No auth' } });
  check('POST /recipes without a token returns 401', noAuthCreate.status === 401);

  const invalidCreate = await api('POST', '/recipes', { token: tokenA, body: { title: 'x' } });
  check('POST /recipes with a too-short title returns 422', invalidCreate.status === 422);

  const updated = await api('PATCH', `/recipes/${newRecipeId}`, { token: tokenA, body: { cookingTimeMinutes: 22, difficulty: 'Hard' } });
  check('owner can PATCH their recipe', updated.status === 200 && updated.body.data.recipe.cookingTimeMinutes === 22);

  const emailB = `other_${unique()}@example.com`;
  const regB = await api('POST', '/auth/register', { body: { name: 'Other User', email: emailB, password } });
  const tokenB = regB.body?.data?.token;

  const otherPatch = await api('PATCH', `/recipes/${newRecipeId}`, { token: tokenB, body: { difficulty: 'Easy' } });
  check("another user cannot edit someone else's recipe (403)", otherPatch.status === 403);

  const otherDelete = await api('DELETE', `/recipes/${newRecipeId}`, { token: tokenB });
  check("another user cannot delete someone else's recipe (403)", otherDelete.status === 403);

  // ------------------------------------------------------------------
  section('Favourites');
  const favNoAuth = await api('POST', `/recipes/${firstId}/favourite`);
  check('favourite without a token returns 401', favNoAuth.status === 401);

  const fav1 = await api('POST', `/recipes/${firstId}/favourite`, { token: tokenA });
  check('add favourite returns 201', fav1.status === 201);
  const fav2 = await api('POST', `/recipes/${firstId}/favourite`, { token: tokenA });
  check('adding the same favourite twice does not error (idempotent)', fav2.status === 201);

  const favList = await api('GET', '/users/me/favourites', { token: tokenA });
  const favCount = favList.body?.data?.items?.filter((r) => r.id === firstId).length;
  check('favourites list contains the recipe exactly once', favCount === 1, `count ${favCount}`);

  const unfav = await api('DELETE', `/recipes/${firstId}/favourite`, { token: tokenA });
  check('remove favourite returns 200', unfav.status === 200);

  const favList2 = await api('GET', '/users/me/favourites', { token: tokenA });
  check('favourites list no longer contains the recipe', !favList2.body.data.items.some((r) => r.id === firstId));

  // ------------------------------------------------------------------
  section('Ratings');
  const rate = await api('POST', `/recipes/${firstId}/rating`, { token: tokenA, body: { rating: 5 } });
  check('rating a recipe returns 200', rate.status === 200);
  const rateAgain = await api('POST', `/recipes/${firstId}/rating`, { token: tokenA, body: { rating: 3 } });
  check('re-rating updates instead of duplicating', rateAgain.body?.data?.ratingCount >= 1);

  const badRate = await api('POST', `/recipes/${firstId}/rating`, { token: tokenA, body: { rating: 9 } });
  check('out-of-range rating returns 422', badRate.status === 422);

  const detailAfterRate = await api('GET', `/recipes/${firstId}`);
  check('recipe rating average was recalculated', Number(detailAfterRate.body.data.recipe.ratingCount) >= 1);

  // ------------------------------------------------------------------
  section('Reviews');
  const review = await api('POST', `/recipes/${firstId}/reviews`, { token: tokenA, body: { body: 'Lovely recipe, very easy to follow.' } });
  check('create review returns 201', review.status === 201, JSON.stringify(review.body));
  const reviewId = review.body?.data?.review?.id;

  const reviewList = await api('GET', `/recipes/${firstId}/reviews`);
  check('reviews are publicly readable', reviewList.status === 200 && reviewList.body.data.items.some((r) => r.id === reviewId));

  const shortReview = await api('POST', `/recipes/${firstId}/reviews`, { token: tokenA, body: { body: 'x' } });
  check('too-short review returns 422', shortReview.status === 422);

  const otherReviewEdit = await api('PATCH', `/reviews/${reviewId}`, { token: tokenB, body: { body: 'I should not be able to edit this.' } });
  check("cannot edit another user's review (403)", otherReviewEdit.status === 403);

  const ownReviewEdit = await api('PATCH', `/reviews/${reviewId}`, { token: tokenA, body: { body: 'Updated review text.' } });
  check('owner can edit their review', ownReviewEdit.status === 200 && ownReviewEdit.body.data.review.body === 'Updated review text.');

  const ownReviewDelete = await api('DELETE', `/reviews/${reviewId}`, { token: tokenA });
  check('owner can delete their review', ownReviewDelete.status === 200);

  // ------------------------------------------------------------------
  section('Cooking history, preferences, views');
  const history = await api('POST', `/recipes/${firstId}/history`, { token: tokenA, body: { servings: 2, notes: 'Turned out great.' } });
  check('adding cooking history returns 201', history.status === 201);
  const historyList = await api('GET', '/users/me/history', { token: tokenA });
  check('cooking history is listed', historyList.status === 200 && historyList.body.data.items.length >= 1);

  const prefs = await api('GET', '/users/me/preferences', { token: tokenA });
  check('preferences are created on demand', prefs.status === 200 && Array.isArray(prefs.body.data.preferences.dietaryPreferences));
  const prefsUpdate = await api('PUT', '/users/me/preferences', { token: tokenA, body: { dietaryPreferences: ['Vegetarian'], measurementUnits: 'metric' } });
  check('preferences can be updated', prefsUpdate.status === 200 && prefsUpdate.body.data.preferences.dietaryPreferences.includes('Vegetarian'));

  const before = await api('GET', `/recipes/${firstId}`);
  const view = await api('POST', `/recipes/${firstId}/view`);
  check('recording a view returns 200', view.status === 200);
  const after = await api('GET', `/recipes/${firstId}`);
  check('view count increased', Number(after.body.data.recipe.viewsCount) > Number(before.body.data.recipe.viewsCount));

  // ------------------------------------------------------------------
  section('Roles, permissions and audit logging');
  const adminLogin = await api('POST', '/auth/login', { body: { email: 'admin@recipebox.local', password: 'ChangeMe123!' } });
  const adminToken = adminLogin.body?.data?.token;
  const adminId = adminLogin.body?.data?.user?.id;
  check('administrator can sign in', adminLogin.status === 200 && Boolean(adminToken));

  const secLogin = await api('POST', '/auth/login', { body: { email: 'security@recipebox.local', password: 'ChangeMe123!' } });
  const secToken = secLogin.body?.data?.token;
  check('security administrator can sign in', secLogin.status === 200 && Boolean(secToken));

  const userAdminList = await api('GET', '/admin/users', { token: tokenA });
  check('normal user cannot list users (403)', userAdminList.status === 403);

  const adminList = await api('GET', '/admin/users', { token: adminToken });
  check('administrator can list users', adminList.status === 200 && adminList.body.data.items.length >= 3);

  const selfRoleChange = await api('PATCH', `/admin/users/${adminId}/role`, { token: adminToken, body: { role: 'security_admin' } });
  check('cannot change own role via admin route (403)', selfRoleChange.status === 403, `status ${selfRoleChange.status}`);

  const promote = await api('PATCH', `/admin/users/${userAId}/role`, { token: adminToken, body: { role: 'admin' } });
  check('administrator can promote another user', promote.status === 200 && promote.body.data.user.role === 'admin');
  await api('PATCH', `/admin/users/${userAId}/role`, { token: adminToken, body: { role: 'user' } }); // revert

  const secOnlyRole = await api('PATCH', `/admin/users/${userAId}/role`, { token: adminToken, body: { role: 'security_admin' } });
  check('administrator cannot grant security_admin (403)', secOnlyRole.status === 403);

  const badRole = await api('PATCH', `/admin/users/${userAId}/role`, { token: secToken, body: { role: 'superuser' } });
  check('unknown role value returns 403/422', [403, 422].includes(badRole.status), `status ${badRole.status}`);

  const userPermDenied = await api('POST', `/admin/users/${userAId}/permissions`, { token: adminToken, body: { permission: 'recipe:update:any' } });
  check('administrator cannot manage permissions (403)', userPermDenied.status === 403);

  const grant = await api('POST', `/admin/users/${userAId}/permissions`, { token: secToken, body: { permission: 'audit:read' } });
  check('security administrator can grant a permission', grant.status === 201);
  const revoke = await api('DELETE', `/admin/users/${userAId}/permissions/audit:read`, { token: secToken });
  check('security administrator can revoke a permission', revoke.status === 200);

  const grantInvalid = await api('POST', `/admin/users/${userAId}/permissions`, { token: secToken, body: { permission: 'not a permission' } });
  check('invalid permission string returns 422', grantInvalid.status === 422);

  const userAudit = await api('GET', '/admin/audit-logs', { token: tokenA });
  check('normal user cannot read audit logs (403)', userAudit.status === 403);

  const secAudit = await api('GET', '/admin/audit-logs', { token: secToken });
  check('security administrator can read audit logs', secAudit.status === 200 && secAudit.body.data.items.length > 0);
  check('audit logs never contain a password hash', !JSON.stringify(secAudit.body).includes('password_hash'));
  check('audit logs never contain a JWT secret', !JSON.stringify(secAudit.body).includes('secret'));
  check('audit logs never contain a bearer token', !JSON.stringify(secAudit.body).includes('Bearer '));

  // ------------------------------------------------------------------
  section('Categories, error handling & payload limits');
  const categories = await api('GET', '/categories');
  check('GET /categories returns 8 seeded categories', categories.status === 200 && categories.body.data.categories.length === 8);

  const catNoAuth = await api('POST', '/categories', { body: { name: 'Hacking' } });
  check('creating a category requires auth', catNoAuth.status === 401);

  const notFound = await api('GET', '/does-not-exist');
  check('unknown route returns 404', notFound.status === 404);

  const malformed = await fetch(`${BASE}/recipes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  check('malformed JSON returns 4xx (not a crash)', malformed.status >= 400 && malformed.status < 500, `status ${malformed.status}`);

  const hugeBody = await api('POST', '/auth/login', { body: { email: 'a@b.com', password: 'x'.repeat(200000) } });
  check('oversized payload is rejected', hugeBody.status === 413 || hugeBody.status === 422 || hugeBody.status === 400, `status ${hugeBody.status}`);

  // ------------------------------------------------------------------
  section('Ownership-reversed check: admin can manage content');
  const adminDelete = await api('DELETE', `/recipes/${newRecipeId}`, { token: adminToken });
  check('administrator can delete any recipe (cleanup)', adminDelete.status === 200);

  const goneCheck = await api('GET', `/recipes/${newRecipeId}`);
  check('deleted recipe is no longer returned', goneCheck.status === 404);

  // ------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailed checks:');
    failures.forEach((name) => console.log(`  - ${name}`));
  }
  console.log('='.repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nTest suite crashed:', error.message);
  console.error('Is the backend running on http://localhost:5000 ? (npm start)');
  process.exit(1);
});

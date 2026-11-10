import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });
const { config } = await import('../src/config/env.js');
const BASE = process.env.API_URL || 'http://localhost:5000/api';
const now = () => new Date().toISOString();
const unique = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;
const results = [];

async function api(method, route, { token, body } = {}) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function check(id, title, expected, actual, passed, evidence = '') {
  results.push({ id, title, expected, actual, passed, evidence });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${id}: ${title} (${actual})`);
}

async function register(name, password) {
  const email = `security_test_${unique()}@example.invalid`;
  const response = await api('POST', '/auth/register', { body: { name, email, password } });
  if (response.status !== 201) throw new Error(`Test user registration failed (${response.status}).`);
  return { email, password, token: response.data.data.token, user: response.data.data.user };
}

async function main() {
  const adminCreds = config.seedAdmin;
  const securityCreds = config.seedSecurityAdmin;
  if (!adminCreds.email || !adminCreds.password || !securityCreds.email || !securityCreds.password) {
    throw new Error('Set bootstrap administrator credentials in backend/.env before running security tests.');
  }
  const adminLogin = await api('POST', '/auth/login', { body: { email: adminCreds.email, password: adminCreds.password } });
  const securityLogin = await api('POST', '/auth/login', { body: { email: securityCreds.email, password: securityCreds.password } });
  if (adminLogin.status !== 200 || securityLogin.status !== 200) throw new Error('Bootstrap administrator login failed; no credential values were written to the report.');
  const adminToken = adminLogin.data.data.token;
  const securityToken = securityLogin.data.data.token;

  const userA = await register('Security Test A', 'TestPass12345');
  const userB = await register('Security Test B', 'TestPass12345');
  let lockoutUser = null;
  let recipeId = null;
  let previousSettings = null;
  let permissionWasEnabled = true;
  try {
    const guest = await api('GET', '/auth/me');
    check('SEC-01', 'Guest is denied a protected profile endpoint', '401', String(guest.status), guest.status === 401);

    const ownProfile = await api('GET', '/auth/me', { token: userA.token });
    check('SEC-02', 'User can read their own profile', '200 and matching account ID', `${ownProfile.status} and ${ownProfile.data?.data?.user?.id}`, ownProfile.status === 200 && ownProfile.data.data.user.id === userA.user.id);

    const otherProfile = await api('GET', `/admin/users/${userA.user.id}`, { token: userB.token });
    check('SEC-03', 'User cannot read another user private profile', '403', String(otherProfile.status), otherProfile.status === 403);

    const created = await api('POST', '/recipes', { token: userA.token, body: {
      title: `Security Test Recipe ${unique()}`, description: 'Temporary authorization test content.', categorySlug: 'dinner',
      cookingTimeMinutes: 12, difficulty: 'Easy', servings: 'Serves 2', ingredients: ['1 cup test rice'], instructions: ['Cook the test rice.'],
    } });
    recipeId = created.data?.data?.recipe?.id;
    check('SEC-04', 'User can create a recipe', '201', String(created.status), created.status === 201 && Boolean(recipeId));

    const otherEdit = await api('PATCH', `/recipes/${recipeId}`, { token: userB.token, body: { title: 'Unauthorized edit' } });
    check('SEC-05', 'User cannot edit another user recipe', '403', String(otherEdit.status), otherEdit.status === 403);

    const adminEdit = await api('PATCH', `/recipes/${recipeId}`, { token: adminToken, body: { description: 'Updated by authorised administrator for the security test.' } });
    check('SEC-06', 'Administrator can manage a recipe', '200', String(adminEdit.status), adminEdit.status === 200);

    const adminSecurity = await api('GET', '/admin/security/settings', { token: adminToken });
    check('SEC-07', 'Administrator is denied restricted security settings', '403', String(adminSecurity.status), adminSecurity.status === 403);

    const rolePermissions = await api('GET', '/admin/role-permissions', { token: securityToken });
    const row = rolePermissions.data?.data?.permissions?.find((entry) => entry.role === 'user' && entry.permission === 'recipe:create');
    if (!row) throw new Error('Role permission catalog is not initialized. Run database initialization.');
    permissionWasEnabled = Boolean(Number(row.enabled));
    const permissionChange = await api('PUT', '/admin/role-permissions', { token: securityToken, body: { role: 'user', permission: 'recipe:create', enabled: false } });
    const blockedRecipe = await api('POST', '/recipes', { token: userA.token, body: { title: `Blocked Create ${unique()}` } });
    await api('PUT', '/admin/role-permissions', { token: securityToken, body: { role: 'user', permission: 'recipe:create', enabled: permissionWasEnabled } });
    check('SEC-08', 'Security Administrator changes permissions and backend enforces them', '200 change followed by 403 write', `${permissionChange.status} change followed by ${blockedRecipe.status} write`, permissionChange.status === 200 && blockedRecipe.status === 403);

    const selfPromote = await api('PATCH', `/admin/users/${userA.user.id}/role`, { token: userA.token, body: { role: 'admin' } });
    check('SEC-09', 'Ordinary user cannot promote their own role', '403', String(selfPromote.status), selfPromote.status === 403);

    const invalid = await api('GET', '/auth/me', { token: 'invalid-token' });
    const expiredToken = jwt.sign({ sub: String(userA.user.id), role: 'admin' }, config.jwt.secret, { expiresIn: -10 });
    const expired = await api('GET', '/auth/me', { token: expiredToken });
    check('SEC-10', 'Invalid and expired tokens are rejected', '401 for both tokens', `${invalid.status} invalid; ${expired.status} expired`, invalid.status === 401 && expired.status === 401);

    const oldSettingsResult = await api('GET', '/admin/security/settings', { token: securityToken });
    previousSettings = oldSettingsResult.data?.data?.settings;
    const configured = await api('PUT', '/admin/security/settings', { token: securityToken, body: { login_max_attempts: 3, lockout_minutes: 1 } });
    lockoutUser = await register('Lockout Test', 'TestPass12345');
    for (let i = 0; i < 3; i += 1) await api('POST', '/auth/login', { body: { email: lockoutUser.email, password: 'WrongPass123' } });
    const locked = await api('POST', '/auth/login', { body: { email: lockoutUser.email, password: lockoutUser.password } });
    check('SEC-11', 'Excessive failed logins trigger account lockout', 'ACCOUNT_LOCKED response', `${configured.status}; ${locked.status} ${locked.data?.error?.code}`, configured.status === 200 && locked.status === 401 && locked.data?.error?.code === 'ACCOUNT_LOCKED');
    if (previousSettings) await api('PUT', '/admin/security/settings', { token: securityToken, body: {
      password_min_length: previousSettings.password_min_length,
      password_require_letter: previousSettings.password_require_letter,
      password_require_number: previousSettings.password_require_number,
      login_max_attempts: previousSettings.login_max_attempts,
      lockout_minutes: previousSettings.lockout_minutes,
      token_expiry_minutes: previousSettings.token_expiry_minutes,
    } });

    const exportData = await api('GET', '/users/me/export', { token: userA.token });
    check('SEC-12', 'User can request their personal data export', '200 with profile and related data', `${exportData.status} with ${Object.keys(exportData.data?.data?.export || {}).length} export sections`, exportData.status === 200 && Boolean(exportData.data?.data?.export?.profile));

    const correction = await api('PATCH', '/auth/me', { token: userA.token, body: { name: 'Corrected Test Name' } });
    check('SEC-13', 'User can correct their profile details', '200 and corrected value', `${correction.status} ${correction.data?.data?.user?.name}`, correction.status === 200 && correction.data.data.user.name === 'Corrected Test Name');

    const deleted = await api('DELETE', '/users/me', { token: userA.token, body: { password: userA.password } });
    const afterDelete = await api('GET', '/auth/me', { token: userA.token });
    check('SEC-14', 'User can delete their account and loses session access', '200 deletion then 401', `${deleted.status} deletion then ${afterDelete.status}`, deleted.status === 200 && afterDelete.status === 401);
  } finally {
    await api('PUT', '/admin/role-permissions', { token: securityToken, body: { role: 'user', permission: 'recipe:create', enabled: permissionWasEnabled } });
    if (previousSettings && securityToken) {
      await api('PUT', '/admin/security/settings', { token: securityToken, body: {
        password_min_length: previousSettings.password_min_length,
        password_require_letter: previousSettings.password_require_letter,
        password_require_number: previousSettings.password_require_number,
        login_max_attempts: previousSettings.login_max_attempts,
        lockout_minutes: previousSettings.lockout_minutes,
        token_expiry_minutes: previousSettings.token_expiry_minutes,
      } });
    }
    if (lockoutUser) await api('DELETE', '/users/me', { token: lockoutUser.token, body: { password: lockoutUser.password } });
    if (userA && !results.find((r) => r.id === 'SEC-14')?.passed) await api('DELETE', '/users/me', { token: userA.token, body: { password: userA.password } });
    if (userB) await api('DELETE', '/users/me', { token: userB.token, body: { password: userB.password } });
  }

  const passed = results.filter((result) => result.passed).length;
  const report = [
    '# RecipeHub Security Test Report',
    '',
    `Executed: ${now()}`,
    `API: ${BASE}`,
    `Result: ${passed}/${results.length} passed; ${results.length - passed} failed.`,
    '',
    '| Test ID | Test | Expected result | Actual result | Status |',
    '|---|---|---|---|---|',
    ...results.map((result) => `| ${result.id} | ${result.title} | ${result.expected} | ${result.actual.replaceAll('|','/')} | ${result.passed ? 'PASS' : 'FAIL'} |`),
    '',
    'The test creates temporary accounts and a temporary recipe. It deletes test accounts at completion and restores the security settings it changed. Passwords, access tokens and database secrets are excluded from the report.',
    '',
  ].join('\n');
  const reportPath = path.resolve(backendDir, '../documentation/security-testing/Security_Test_Report.md');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, 'utf8');
  console.log(`Security tests: ${passed}/${results.length} passed.`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => { console.error(`Security test run could not complete: ${error.message}`); process.exitCode = 1; });

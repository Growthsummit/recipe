import { queryAll, queryOne, execute, withTransaction } from '../config/database.js';
import { ROLE_PERMISSIONS } from '../config/roles.js';

/**
 * Every query here returns rows WITHOUT password_hash.
 * `findUserWithSecretByEmail` is the single exception and is only used by login.
 */
const PUBLIC_COLUMNS = 'id, name, email, role, bio, avatar_url, is_active, last_login_at, created_at, updated_at';

export async function findUserById(id) {
  return queryOne(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
}

export async function findUserByEmail(email) {
  return queryOne(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE email = ?`, [email.toLowerCase()]);
}

export async function findUserWithSecretByEmail(email) {
  return queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
}

export async function createUser({ name, email, passwordHash, role = 'user' }) {
  const result = await execute(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    [name, email.toLowerCase(), passwordHash, role]
  );
  return findUserById(Number(result.lastInsertRowid));
}

export async function updateUserProfile(id, fields) {
  const allowed = ['name', 'bio', 'avatar_url', 'email'];
  const entries = Object.entries(fields).filter(
    ([key, value]) => allowed.includes(key) && value !== undefined
  );
  if (entries.length === 0) return findUserById(id);

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  await execute(
    `UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    [...values, id]
  );
  return findUserById(id);
}

export async function updateUserPassword(id, passwordHash) {
  await execute(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
    [passwordHash, id]
  );
}

export async function createPasswordResetToken(tokenHash, userId, expiresAt) {
  await execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
  await execute('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash, userId, expiresAt]);
}

export async function deletePasswordResetToken(tokenHash) {
  await execute('DELETE FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]);
}

export async function completePasswordReset(tokenHash, passwordHash) {
  return withTransaction(async (tx) => {
    const consumed = await tx.execute({ sql: "DELETE FROM password_reset_tokens WHERE token_hash = ? AND expires_at > datetime('now') RETURNING user_id", args: [tokenHash] });
    if (!consumed.rows.length) return false;
    await tx.execute({ sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", args: [passwordHash, consumed.rows[0].user_id] });
    return Number(consumed.rows[0].user_id);
  });
}

export async function touchLastLogin(id) {
  await execute(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [id]);
}

/** Extra permissions granted on top of the role defaults. */
export async function getExtraPermissions(userId) {
  const rows = await queryAll('SELECT permission FROM user_permissions WHERE user_id = ?', [userId]);
  return rows.map((row) => row.permission);
}

export async function getRolePermissions(role) {
  const configured = await queryAll('SELECT permission FROM role_permissions WHERE role=? AND enabled=1 ORDER BY permission', [role]);
  const configuredCount = await queryOne('SELECT COUNT(*) AS count FROM role_permissions WHERE role=?', [role]);
  if (Number(configuredCount?.count || 0) > 0) return configured.map((row) => row.permission);
  return ROLE_PERMISSIONS[role] || [];
}

export async function getEffectivePermissions(role, userId) {
  const base = await getRolePermissions(role);
  const disabled = await queryAll('SELECT permission FROM role_permissions WHERE role=? AND enabled=0', [role]);
  const disabledSet = new Set(disabled.map((row) => row.permission));
  const extra = await queryAll('SELECT permission FROM user_permissions WHERE user_id=?', [userId]);
  return [...new Set([...base, ...extra.map((row) => row.permission).filter((permission) => !disabledSet.has(permission))])];
}

export async function setRolePermission(role, permission, enabled, updatedBy) {
  await execute(
    `INSERT INTO role_permissions(role,permission,enabled,updated_by) VALUES(?,?,?,?)
     ON CONFLICT(role,permission) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=datetime('now')`,
    [role, permission, enabled ? 1 : 0, updatedBy]
  );
  return listRolePermissionRecords();
}

export async function listRolePermissionRecords() {
  return queryAll('SELECT role,permission,enabled,updated_at FROM role_permissions ORDER BY role,permission');
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

export async function listUsers({ limit, offset }) {
  const items = await queryAll(
    `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const countRow = await queryOne('SELECT COUNT(*) AS count FROM users');
  return { items, total: countRow.count };
}

export async function setUserRole(userId, role) {
  await execute(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`, [role, userId]);
  return findUserById(userId);
}

export async function setUserActive(userId, isActive) {
  await execute(
    `UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    [isActive ? 1 : 0, userId]
  );
  return findUserById(userId);
}

export async function grantPermission(userId, permission, grantedBy) {
  await execute(
    `INSERT INTO user_permissions (user_id, permission, granted_by) VALUES (?, ?, ?)
     ON CONFLICT (user_id, permission) DO NOTHING`,
    [userId, permission, grantedBy]
  );
}

export async function revokePermission(userId, permission) {
  await execute('DELETE FROM user_permissions WHERE user_id = ? AND permission = ?', [
    userId,
    permission,
  ]);
}

export async function listPermissions(userId) {
  return queryAll(
    `SELECT id, permission, granted_by, created_at FROM user_permissions WHERE user_id = ? ORDER BY permission`,
    [userId]
  );
}

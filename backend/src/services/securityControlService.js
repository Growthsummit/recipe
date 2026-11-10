import { createHash } from 'node:crypto';
import { execute, queryAll, queryOne, withTransaction } from '../config/database.js';
import { badRequest, unauthorized } from '../utils/errors.js';

export const SECURITY_SETTING_DEFAULTS = Object.freeze({
  password_min_length: 8,
  password_require_letter: true,
  password_require_number: true,
  login_max_attempts: 5,
  lockout_minutes: 15,
  token_expiry_minutes: 10080,
});

const BOOLEAN_KEYS = new Set(['password_require_letter', 'password_require_number']);
export const hashLoginIdentity = (email) => createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

export async function getSecuritySettings() {
  const rows = await queryAll('SELECT setting_key, setting_value, updated_at FROM security_settings ORDER BY setting_key');
  const values = { ...SECURITY_SETTING_DEFAULTS };
  const updated = {};
  for (const row of rows) {
    if (!(row.setting_key in values)) continue;
    values[row.setting_key] = BOOLEAN_KEYS.has(row.setting_key)
      ? row.setting_value === 'true'
      : Number(row.setting_value);
    updated[row.setting_key] = row.updated_at;
  }
  return { ...values, updatedAt: updated };
}

export async function updateSecuritySettings(changes, updatedBy) {
  const allowed = Object.keys(SECURITY_SETTING_DEFAULTS);
  for (const key of allowed) {
    if (changes[key] === undefined) continue;
    await execute(
      `INSERT INTO security_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,
         updated_by=excluded.updated_by, updated_at=datetime('now')`,
      [key, String(changes[key]), updatedBy]
    );
  }
  return getSecuritySettings();
}

export async function enforcePasswordPolicy(password) {
  const settings = await getSecuritySettings();
  if (password.length < settings.password_min_length) {
    throw badRequest(`Password must be at least ${settings.password_min_length} characters.`, 'PASSWORD_POLICY');
  }
  if (settings.password_require_letter && !/[A-Za-z]/.test(password)) {
    throw badRequest('Password must contain at least one letter.', 'PASSWORD_POLICY');
  }
  if (settings.password_require_number && !/[0-9]/.test(password)) {
    throw badRequest('Password must contain at least one number.', 'PASSWORD_POLICY');
  }
  return settings;
}

export async function assertLoginNotLocked(email) {
  const row = await queryOne('SELECT locked_until FROM login_security WHERE email_hash=?', [hashLoginIdentity(email)]);
  if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    throw unauthorized('Too many failed sign-in attempts. Try again after the account lockout period.', 'ACCOUNT_LOCKED');
  }
}

export async function recordFailedLogin(email) {
  const settings = await getSecuritySettings();
  const hash = hashLoginIdentity(email);
  return withTransaction(async (tx) => {
    const result = await tx.execute({ sql: 'SELECT failed_count,locked_until FROM login_security WHERE email_hash=?', args: [hash] });
    const row = result.rows[0];
    const now = Date.now();
    const lockTime = row?.locked_until ? new Date(row.locked_until).getTime() : null;
    const stillLocked = lockTime && lockTime > now;
    const count = stillLocked ? Number(row.failed_count) : lockTime && lockTime <= now ? 1 : Number(row?.failed_count || 0) + 1;
    const lockedUntil = count >= settings.login_max_attempts
      ? new Date(now + settings.lockout_minutes * 60_000).toISOString()
      : null;
    await tx.execute({
      sql: `INSERT INTO login_security(email_hash,failed_count,locked_until) VALUES(?,?,?)
            ON CONFLICT(email_hash) DO UPDATE SET failed_count=excluded.failed_count,
              locked_until=excluded.locked_until, updated_at=datetime('now')`,
      args: [hash, count, lockedUntil],
    });
    return { count, lockedUntil, limit: settings.login_max_attempts };
  });
}

export async function clearFailedLogin(email) {
  await execute('DELETE FROM login_security WHERE email_hash=?', [hashLoginIdentity(email)]);
}

export async function getSecurityDashboard() {
  const [users, roles, recentEvents, failedLogins, permissionChanges] = await Promise.all([
    queryOne('SELECT COUNT(*) AS total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active FROM users'),
    queryAll('SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY role'),
    queryAll(`SELECT id,user_id,actor_role,action,entity,entity_id,ip_address,created_at
              FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 12`),
    queryAll(`SELECT id,user_id,actor_role,action,ip_address,created_at FROM audit_logs
              WHERE action IN ('LOGIN_FAILED','LOGIN_BLOCKED') ORDER BY created_at DESC,id DESC LIMIT 12`),
    queryAll(`SELECT id,user_id,actor_role,action,entity,entity_id,metadata,created_at FROM audit_logs
              WHERE action IN ('PERMISSION_GRANTED','PERMISSION_REVOKED','USER_ROLE_CHANGED','ROLE_PERMISSION_CHANGED','SECURITY_SETTINGS_UPDATED')
              ORDER BY created_at DESC,id DESC LIMIT 12`),
  ]);
  return { users: { total: Number(users?.total || 0), active: Number(users?.active || 0) }, roles, recentEvents, failedLogins, permissionChanges };
}

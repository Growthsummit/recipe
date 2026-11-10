import { execute, queryAll, queryOne, withTransaction } from '../config/database.js';
import { hashLoginIdentity } from './securityControlService.js';

export async function exportUserData(userId) {
  const [profile, preferences, consents, wallet, permissions, createdRecipes, favourites, history, ratings, reviews, auditEvents] = await Promise.all([
    queryOne('SELECT id,name,email,bio,avatar_url,role,created_at,updated_at,last_login_at FROM users WHERE id=?', [userId]),
    queryOne('SELECT dietary_preferences,theme,language,measurement_units,email_notifications,updated_at FROM user_preferences WHERE user_id=?', [userId]),
    queryAll('SELECT consent_key,granted,policy_version,updated_at FROM user_consents WHERE user_id=? ORDER BY consent_key', [userId]),
    queryOne('SELECT address,verified_at FROM user_wallets WHERE user_id=?', [userId]),
    queryAll('SELECT permission,created_at FROM user_permissions WHERE user_id=? ORDER BY permission', [userId]),
    queryAll('SELECT id,title,description,slug,status,is_published,created_at,updated_at FROM recipes WHERE author_id=? ORDER BY created_at', [userId]),
    queryAll(`SELECT r.id,r.title,r.slug,f.created_at AS saved_at FROM favourites f JOIN recipes r ON r.id=f.recipe_id WHERE f.user_id=? ORDER BY f.created_at`, [userId]),
    queryAll(`SELECT ch.recipe_id,r.title,ch.cooked_at,ch.servings,ch.notes FROM cooking_history ch JOIN recipes r ON r.id=ch.recipe_id WHERE ch.user_id=? ORDER BY ch.cooked_at`, [userId]),
    queryAll('SELECT recipe_id,rating,created_at,updated_at FROM ratings WHERE user_id=? ORDER BY created_at', [userId]),
    queryAll('SELECT recipe_id,body,created_at,updated_at FROM reviews WHERE user_id=? ORDER BY created_at', [userId]),
    queryAll('SELECT action,entity,created_at FROM audit_logs WHERE user_id=? ORDER BY created_at', [userId]),
  ]);
  let dietaryPreferences = [];
  try { dietaryPreferences = JSON.parse(preferences?.dietary_preferences || '[]'); } catch { /* ignore malformed legacy value */ }
  return {
    exportedAt: new Date().toISOString(),
    profile,
    preferences: preferences ? { ...preferences, dietary_preferences: dietaryPreferences } : null,
    consents,
    wallet,
    permissions,
    createdRecipes,
    favourites,
    cookingHistory: history,
    ratings,
    reviews,
    auditEvents,
  };
}

export async function getUserConsents(userId) {
  const rows = await queryAll('SELECT consent_key,granted,policy_version,updated_at FROM user_consents WHERE user_id=?', [userId]);
  const byKey = new Map(rows.map((row) => [row.consent_key, row]));
  return ['analytics', 'marketing'].map((key) => ({
    key,
    granted: Boolean(byKey.get(key)?.granted),
    policyVersion: byKey.get(key)?.policy_version || '2026-11-07',
    updatedAt: byKey.get(key)?.updated_at || null,
  }));
}

export async function updateUserConsents(userId, consents) {
  for (const [key, granted] of Object.entries(consents)) {
    if (granted === undefined) continue;
    await execute(
      `INSERT INTO user_consents(user_id,consent_key,granted,policy_version) VALUES(?,?,?,'2026-11-07')
       ON CONFLICT(user_id,consent_key) DO UPDATE SET granted=excluded.granted,
         policy_version=excluded.policy_version,updated_at=datetime('now')`,
      [userId, key, granted ? 1 : 0]
    );
  }
  return getUserConsents(userId);
}

export async function eraseUserAccount(userId) {
  const user = await queryOne('SELECT id,email FROM users WHERE id=?', [userId]);
  if (!user) return false;
  await withTransaction(async (tx) => {
    await tx.execute({ sql: 'DELETE FROM login_security WHERE email_hash=?', args: [hashLoginIdentity(user.email)] });
    for (const table of ['favourites', 'ratings', 'reviews', 'cooking_history', 'user_preferences', 'user_permissions', 'user_consents', 'user_wallets', 'wallet_challenges']) {
      await tx.execute({ sql: `DELETE FROM ${table} WHERE user_id=?`, args: [userId] });
    }
    // Keep security events for accountability, but remove account link and network identifiers.
    await tx.execute({
      sql: `UPDATE audit_logs SET user_id=NULL,entity_id=NULL,ip_address=NULL,user_agent=NULL
            WHERE user_id=?`,
      args: [userId],
    });
    // User-created recipes are part of the account's content. Remove them so an
    // erasure request does not leave the user's writing attached to the service.
    await tx.execute({ sql: 'DELETE FROM recipes WHERE author_id=?', args: [userId] });
    await tx.execute({ sql: 'DELETE FROM users WHERE id=?', args: [userId] });
  });
  return true;
}

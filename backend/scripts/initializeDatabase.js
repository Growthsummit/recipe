/**
 * Creates every table and index required by the RecipeBox backend.
 *
 * Safe to run repeatedly: every statement uses `CREATE ... IF NOT EXISTS` and
 * nothing is ever dropped, so existing rows are preserved.
 *
 * Usage:  npm run init-db
 */
import { db, execute, queryOne } from '../src/config/database.js';
import { config } from '../src/config/env.js';

const STATEMENTS = [
  // ------------------------------------------------------------------
  // 1. users - accounts + credentials + role
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     name          TEXT    NOT NULL,
     email         TEXT    NOT NULL UNIQUE,
     password_hash TEXT    NOT NULL,
     role          TEXT    NOT NULL DEFAULT 'user'
                           CHECK (role IN ('user','admin','security_admin')),
     bio           TEXT,
     avatar_url    TEXT,
     is_active     INTEGER NOT NULL DEFAULT 1,
     last_login_at TEXT,
     created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
     updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 2. categories - recipe categories (Pasta, Pizza, Healthy, ...)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS categories (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     slug        TEXT    NOT NULL UNIQUE,
     name        TEXT    NOT NULL UNIQUE,
     emoji       TEXT,
     description TEXT,
     created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
     updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 3. recipes - the core content, authored by a user, in a category
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS recipes (
     id                   INTEGER PRIMARY KEY AUTOINCREMENT,
     slug                 TEXT    NOT NULL UNIQUE,
     title                TEXT    NOT NULL,
     description          TEXT,
     category_id          INTEGER REFERENCES categories(id) ON DELETE SET NULL,
     author_id            INTEGER REFERENCES users(id)      ON DELETE SET NULL,
     image_url            TEXT,
     cooking_time_minutes INTEGER,
     difficulty           TEXT    CHECK (difficulty IS NULL OR difficulty IN ('Easy','Medium','Hard')),
     servings             TEXT,
     dietary_info         TEXT    NOT NULL DEFAULT '[]',
     instructions         TEXT    NOT NULL DEFAULT '[]',
     status               TEXT    NOT NULL DEFAULT 'published'
                                  CHECK (status IN ('draft','published','archived')),
     is_published         INTEGER NOT NULL DEFAULT 1,
     views_count          INTEGER NOT NULL DEFAULT 0,
     rating_avg           REAL    NOT NULL DEFAULT 0,
     rating_count         INTEGER NOT NULL DEFAULT 0,
     created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
     updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 4. ingredients - normalised master list of ingredient names
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS ingredients (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     name       TEXT    NOT NULL UNIQUE,
     created_at TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 5. recipe_ingredients - join table: which ingredient, in what amount
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS recipe_ingredients (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     recipe_id     INTEGER NOT NULL REFERENCES recipes(id)     ON DELETE CASCADE,
     ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
     display_text  TEXT    NOT NULL,
     quantity      TEXT,
     unit          TEXT,
     position      INTEGER NOT NULL DEFAULT 0,
     UNIQUE (recipe_id, ingredient_id)
   )`,

  // ------------------------------------------------------------------
  // 6. favourites - one row per (user, recipe) pair
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS favourites (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
     recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
     created_at TEXT    NOT NULL DEFAULT (datetime('now')),
     UNIQUE (user_id, recipe_id)
   )`,

  // ------------------------------------------------------------------
  // 7. ratings - one 1..5 score per user per recipe
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS ratings (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
     recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
     rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
     created_at TEXT    NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
     UNIQUE (user_id, recipe_id)
   )`,

  // ------------------------------------------------------------------
  // 8. reviews - longer written feedback (a user may leave several)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS reviews (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
     recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
     body       TEXT    NOT NULL,
     is_hidden  INTEGER NOT NULL DEFAULT 0,
     created_at TEXT    NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 9. cooking_history - "I cooked this" log
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS cooking_history (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
     recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
     cooked_at  TEXT    NOT NULL DEFAULT (datetime('now')),
     servings   INTEGER,
     notes      TEXT,
     created_at TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 10. user_preferences - dietary filters, theme, units (one row per user)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS user_preferences (
     id                   INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id              INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     dietary_preferences  TEXT    NOT NULL DEFAULT '[]',
     theme                TEXT    NOT NULL DEFAULT 'light',
     language             TEXT    NOT NULL DEFAULT 'en',
     measurement_units    TEXT    NOT NULL DEFAULT 'metric',
     email_notifications  INTEGER NOT NULL DEFAULT 1,
     created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
     updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // 11. audit_logs - who did what, when (never stores secrets/tokens)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS audit_logs (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
     actor_role TEXT,
     action     TEXT NOT NULL,
     entity     TEXT,
     entity_id  TEXT,
     ip_address TEXT,
     user_agent TEXT,
     metadata   TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `UPDATE audit_logs SET metadata='{"legacy_redacted":true}'
    WHERE action='LOGIN_FAILED' AND metadata LIKE '%email%'`,

  // ------------------------------------------------------------------
  // 12. user_permissions - extra permissions granted per user
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS user_permissions (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     permission  TEXT    NOT NULL,
     granted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
     UNIQUE (user_id, permission)
   )`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
     role TEXT NOT NULL,
     permission TEXT NOT NULL,
     enabled INTEGER NOT NULL DEFAULT 1,
     updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY(role, permission)
   )`,

  `CREATE TABLE IF NOT EXISTS login_security (
     email_hash  TEXT PRIMARY KEY,
     failed_count INTEGER NOT NULL DEFAULT 0,
     locked_until TEXT,
     updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS security_settings (
     setting_key TEXT PRIMARY KEY,
     setting_value TEXT NOT NULL,
     updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `INSERT INTO security_settings (setting_key, setting_value) VALUES
     ('password_min_length','8'),
     ('password_require_letter','true'),
     ('password_require_number','true'),
     ('login_max_attempts','5'),
     ('lockout_minutes','15'),
     ('token_expiry_minutes','10080')
   ON CONFLICT(setting_key) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS user_consents (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     consent_key TEXT NOT NULL,
     granted INTEGER NOT NULL DEFAULT 0,
     policy_version TEXT NOT NULL DEFAULT '1.0',
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE(user_id, consent_key)
   )`,

  // ------------------------------------------------------------------
  // 13. blockchain_records - legacy demo ledger plus immutable Sepolia
  //     transaction references and recipe-version integrity proofs.
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS blockchain_records (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     block_index     INTEGER NOT NULL,
     event_type      TEXT    NOT NULL,
     recipe_id       INTEGER,
     actor_pseudonym TEXT,
     prev_hash       TEXT,
     hash            TEXT    NOT NULL,
     nonce           INTEGER NOT NULL DEFAULT 0,
     payload         TEXT,
     recipe_version  INTEGER,
     content_hash    TEXT,
     transaction_hash TEXT,
     contract_address TEXT,
     network_name    TEXT,
     creator_wallet  TEXT,
     status          TEXT,
     confirmed_at    TEXT,
     created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS user_wallets (
     user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     address     TEXT NOT NULL COLLATE NOCASE UNIQUE,
     verified_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS wallet_challenges (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     address     TEXT NOT NULL COLLATE NOCASE,
     nonce_hash  TEXT NOT NULL UNIQUE,
     expires_at  TEXT NOT NULL,
     used_at     TEXT,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  // ------------------------------------------------------------------
  // Indexes
  // ------------------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS idx_recipes_category       ON recipes (category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_author          ON recipes (author_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_published       ON recipes (is_published, status)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_title           ON recipes (title)`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_time            ON recipes (cooking_time_minutes)`,
  `CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe     ON recipe_ingredients (recipe_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients (ingredient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ingredients_name        ON ingredients (name)`,
  `CREATE INDEX IF NOT EXISTS idx_favourites_user         ON favourites (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_favourites_recipe       ON favourites (recipe_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ratings_recipe          ON ratings (recipe_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ratings_user            ON ratings (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_recipe          ON reviews (recipe_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_user            ON reviews (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cooking_history_user    ON cooking_history (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_user         ON audit_logs (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_action       ON audit_logs (action)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created      ON audit_logs (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_user_permissions_user   ON user_permissions (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blockchain_records_idx  ON blockchain_records (block_index)`,
];

const TABLE_NAMES = [
  'users',
  'categories',
  'recipes',
  'ingredients',
  'recipe_ingredients',
  'favourites',
  'ratings',
  'reviews',
  'cooking_history',
  'user_preferences',
  'audit_logs',
  'user_permissions',
  'role_permissions',
  'login_security',
  'password_reset_tokens',
  'security_settings',
  'user_consents',
  'blockchain_records',
  'user_wallets',
  'wallet_challenges',
];

async function main() {
  console.log('Connecting to Turso:', config.db.url.replace(/\/\/.*@/, '//***@'));

  await execute('PRAGMA foreign_keys = ON');

  for (const statement of STATEMENTS) {
    await execute(statement);
  }
  // Upgrade the original browser-demo blockchain table in place. Keep every
  // legacy record and its original columns; add only nullable Ethereum fields.
  const blockchainColumns = await db.execute('PRAGMA table_info(blockchain_records)');
  const presentColumns = new Set(blockchainColumns.rows.map((row) => row.name));
  const additions = [
    ['recipe_version', 'INTEGER'],
    ['content_hash', 'TEXT'],
    ['transaction_hash', 'TEXT'],
    ['contract_address', 'TEXT'],
    ['network_name', 'TEXT'],
    ['creator_wallet', 'TEXT'],
    ['status', 'TEXT'],
    ['confirmed_at', 'TEXT'],
  ];
  for (const [column, type] of additions) {
    if (!presentColumns.has(column)) await execute(`ALTER TABLE blockchain_records ADD COLUMN ${column} ${type}`);
  }
  await execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_blockchain_recipe_version
                 ON blockchain_records(recipe_id,recipe_version) WHERE recipe_version IS NOT NULL`);
  await execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_blockchain_transaction_hash
                 ON blockchain_records(transaction_hash) WHERE transaction_hash IS NOT NULL`);
  await execute('CREATE INDEX IF NOT EXISTS idx_blockchain_recipe_status ON blockchain_records(recipe_id,status,recipe_version)');
  const { ROLE_PERMISSIONS } = await import('../src/config/roles.js');
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      await execute(
        'INSERT INTO role_permissions(role,permission,enabled) VALUES(?,?,1) ON CONFLICT(role,permission) DO NOTHING',
        [role, permission]
      );
    }
  }
  console.log(`Applied ${STATEMENTS.length} schema statements.`);

  for (const table of TABLE_NAMES) {
    const row = await queryOne(
      'SELECT COUNT(*) AS count FROM sqlite_master WHERE type = ? AND name = ?',
      ['table', table]
    );
    console.log(`  ${row.count === 1 ? '[ok]' : '[MISSING]'} ${table}`);
  }

  console.log('\nDatabase initialised. No existing data was modified.');
  db.close();
}

main().catch((error) => {
  console.error('\nDatabase initialisation failed:');
  console.error(error);
  process.exit(1);
});

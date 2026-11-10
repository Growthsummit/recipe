import { createClient } from '@libsql/client';
import { config } from './env.js';

// Single shared libSQL client for the whole process.
export const db = createClient({
  url: config.db.url,
  authToken: config.db.authToken,
});

/**
 * Small query helpers so the rest of the code never has to import the raw client.
 * Every helper uses parameterised statements (positional `?` placeholders),
 * which is what protects us against SQL injection.
 */

/** Run a write statement and return libSQL's result summary. */
export async function execute(sql, params = []) {
  return db.execute({ sql, args: params });
}

/** Run a SELECT and return all rows as plain objects. */
export async function queryAll(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows.map((row) => ({ ...row }));
}

/** Run a SELECT expected to return a single row (or null). */
export async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Execute several statements inside a single transaction.
 * `work` receives a transactional client and must return a value.
 */
export async function withTransaction(work) {
  const tx = await db.transaction('write');
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/** Quick connectivity check used by the startup banner and tests. */
export async function pingDatabase() {
  const row = await queryOne('SELECT 1 AS ok');
  return row?.ok === 1;
}

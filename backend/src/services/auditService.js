import { execute, queryAll, queryOne } from '../config/database.js';

/**
 * Writes an audit trail entry. Deliberately never stores passwords, hashes,
 * JWTs or database credentials - only the action, the entity and safe metadata.
 */
export async function recordAudit({
  userId = null,
  actorRole = null,
  action,
  entity = null,
  entityId = null,
  req = null,
  metadata = null,
}) {
  const ipAddress = req ? req.ip || null : null;
  const userAgent = req ? (req.headers['user-agent'] || '').slice(0, 400) : null;

  try {
    await execute(
      `INSERT INTO audit_logs (user_id, actor_role, action, entity, entity_id, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        actorRole,
        action,
        entity,
        entityId === null || entityId === undefined ? null : String(entityId),
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (error) {
    // Auditing must never break the request it is describing.
    console.warn('[audit] failed to write entry:', error.message);
  }
}

export async function listAuditLogs({ limit, offset, action, userId, from, to }) {
  const filters = [];
  const params = [];
  if (action) {
    filters.push('action = ?');
    params.push(action);
  }
  if (userId) {
    filters.push('user_id = ?');
    params.push(userId);
  }
  if (from) { filters.push('created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { filters.push('created_at <= ?'); params.push(`${to} 23:59:59`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const items = await queryAll(
    `SELECT id, user_id, actor_role, action, entity, entity_id, ip_address, metadata, created_at
       FROM audit_logs ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const countRow = await queryOne(`SELECT COUNT(*) AS count FROM audit_logs ${where}`, params);
  return { items, total: countRow.count };
}

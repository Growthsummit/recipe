import { asyncHandler, forbidden, notFound } from '../utils/errors.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { createHash, randomBytes } from 'node:crypto';
import { sendPasswordResetEmail } from '../services/emailService.js';
import {
  findUserById,
  grantPermission,
  listPermissions,
  listUsers,
  revokePermission,
  getEffectivePermissions,
  getRolePermissions,
  listRolePermissionRecords,
  setRolePermission,
  setUserActive,
  setUserRole,
  createPasswordResetToken,
  deletePasswordResetToken,
} from '../services/userService.js';
import { listAuditLogs, recordAudit } from '../services/auditService.js';
import { ASSIGNABLE_ROLES, ROLE_PERMISSIONS, ROLES } from '../config/roles.js';

const q = (req) => req.validatedQuery || req.query;

const publicUser = async (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  bio: user.bio,
  avatarUrl: user.avatar_url,
  isActive: Boolean(user.is_active),
  lastLoginAt: user.last_login_at,
  createdAt: user.created_at,
  permissions: await getEffectivePermissions(user.role, user.id),
});

/** GET /api/admin/users */
export const listUsersHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination(q(req));
  const { items, total } = await listUsers(pagination);
  res.json({ success: true, data: paginated(await Promise.all(items.map((u) => publicUser(u))), total, pagination) });
});

/** GET /api/admin/users/:id */
export const getUserHandler = asyncHandler(async (req, res) => {
  const user = await findUserById(Number(req.params.id));
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');
  res.json({ success: true, data: { user: await publicUser(user) } });
});

/** PATCH /api/admin/users/:id/role */
export const updateUserRoleHandler = asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body;

  const target = await findUserById(targetId);
  if (!target) throw notFound('User not found', 'USER_NOT_FOUND');

  // Nobody may change their own role - this is what stops self-promotion.
  if (targetId === Number(req.auth.id)) {
    throw forbidden('You cannot change your own role.', 'SELF_ROLE_CHANGE');
  }
  // A security administrator can only be changed by another security administrator.
  if (target.role === ROLES.SECURITY_ADMIN && req.auth.role !== ROLES.SECURITY_ADMIN) {
    throw forbidden('Only a Security Administrator can change a Security Administrator.', 'PROTECTED_ROLE');
  }
  // Granting the security administrator role requires that role already.
  if (role === ROLES.SECURITY_ADMIN && req.auth.role !== ROLES.SECURITY_ADMIN) {
    throw forbidden('Only a Security Administrator can grant the Security Administrator role.', 'PROTECTED_ROLE');
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw forbidden('That role cannot be assigned.', 'INVALID_ROLE');
  }

  const updated = await setUserRole(targetId, role);

  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'USER_ROLE_CHANGED',
    entity: 'user',
    entityId: targetId,
    req,
    metadata: { from: target.role, to: role },
  });

  res.json({ success: true, data: { user: await publicUser(updated) } });
});

/** PATCH /api/admin/users/:id/active */
export const updateUserActiveHandler = asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const { isActive } = req.body;

  const target = await findUserById(targetId);
  if (!target) throw notFound('User not found', 'USER_NOT_FOUND');

  if (targetId === Number(req.auth.id)) {
    throw forbidden('You cannot deactivate your own account.', 'SELF_DEACTIVATE');
  }
  if (target.role === ROLES.SECURITY_ADMIN && req.auth.role !== ROLES.SECURITY_ADMIN) {
    throw forbidden('Only a Security Administrator can deactivate a Security Administrator.', 'PROTECTED_ROLE');
  }

  const updated = await setUserActive(targetId, isActive);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: isActive ? 'USER_ENABLED' : 'USER_DISABLED',
    entity: 'user',
    entityId: targetId,
    req,
  });

  res.json({ success: true, data: { user: await publicUser(updated) } });
});

/** POST /api/admin/users/:id/password-reset */
export const sendUserPasswordResetHandler = asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const target = await findUserById(targetId);
  if (!target) throw notFound('User not found', 'USER_NOT_FOUND');
  if (target.role === ROLES.SECURITY_ADMIN && req.auth.role !== ROLES.SECURITY_ADMIN) {
    throw forbidden('Only a Security Administrator can reset a Security Administrator password.', 'PROTECTED_ROLE');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await createPasswordResetToken(tokenHash, targetId, expiresAt);
  try {
    await sendPasswordResetEmail({ email: target.email, name: target.name, token });
  } catch (error) {
    await deletePasswordResetToken(tokenHash);
    throw error;
  }
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'PASSWORD_RESET_EMAIL_SENT', entity: 'user', entityId: targetId, req });
  res.json({ success: true, data: { message: `Password reset email sent to ${target.email}.` } });
});

/** GET /api/admin/users/:id/permissions */
export const listPermissionsHandler = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');
  const permissions = await listPermissions(userId);
  res.json({
    success: true,
    data: {
      userId,
      rolePermissions: await getRolePermissions(user.role),
      extraPermissions: permissions,
    },
  });
});

/** POST /api/admin/users/:id/permissions */
export const grantPermissionHandler = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === Number(req.auth.id)) throw forbidden('You cannot grant permissions to your own account.', 'SELF_PERMISSION_CHANGE');
  const allowedPermissions = new Set(Object.values(ROLE_PERMISSIONS).flat());
  if (!allowedPermissions.has(req.body.permission)) throw forbidden('That permission is not defined by the server policy.', 'UNKNOWN_PERMISSION');
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');

  await grantPermission(userId, req.body.permission, req.auth.id);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'PERMISSION_GRANTED',
    entity: 'user',
    entityId: userId,
    req,
    metadata: { permission: req.body.permission },
  });

  const permissions = await listPermissions(userId);
  res.status(201).json({ success: true, data: { userId, extraPermissions: permissions } });
});

/** DELETE /api/admin/users/:id/permissions/:permission */
export const revokePermissionHandler = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === Number(req.auth.id)) throw forbidden('You cannot change permissions on your own account.', 'SELF_PERMISSION_CHANGE');
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');

  await revokePermission(userId, req.params.permission);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'PERMISSION_REVOKED',
    entity: 'user',
    entityId: userId,
    req,
    metadata: { permission: req.params.permission },
  });

  const permissions = await listPermissions(userId);
  res.json({ success: true, data: { userId, extraPermissions: permissions } });
});

/** GET /api/admin/audit-logs */
export const listAuditLogsHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination({ ...q(req), limit: q(req).limit || 50 });
  const { items, total } = await listAuditLogs({
    ...pagination,
    action: q(req).action,
    userId: q(req).userId,
    from: q(req).from,
    to: q(req).to,
  });
  res.json({ success: true, data: paginated(items, total, pagination) });
});

export const listRolePermissionsHandler = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { permissions: await listRolePermissionRecords(), catalog: Object.values(ROLE_PERMISSIONS).flat().filter((value, index, all) => all.indexOf(value) === index) } });
});

export const updateRolePermissionHandler = asyncHandler(async (req, res) => {
  const { role, permission, enabled } = req.body;
  const known = new Set(Object.values(ROLE_PERMISSIONS).flat());
  if (!known.has(permission)) throw forbidden('That permission is not defined by the server policy.', 'UNKNOWN_PERMISSION');
  const protectedSecurityPermissions = new Set(['user:read', 'user:manage', 'permission:read', 'permission:manage', 'audit:read', 'security:read', 'security:configure', 'classification:read']);
  if (role === ROLES.SECURITY_ADMIN && protectedSecurityPermissions.has(permission) && !enabled) {
    throw forbidden('Core Security Administrator permissions cannot be disabled.', 'CORE_PERMISSION_LOCKED');
  }
  await setRolePermission(role, permission, enabled, req.auth.id);
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'ROLE_PERMISSION_CHANGED', entity: 'role', entityId: role, req, metadata: { permission, enabled } });
  res.json({ success: true, data: { permissions: await listRolePermissionRecords() } });
});

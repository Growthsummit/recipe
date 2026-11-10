import { asyncHandler, conflict, unauthorized, badRequest } from '../utils/errors.js';
import { createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/tokens.js';
import {
  createUser,
  findUserById,
  findUserWithSecretByEmail,
  findUserByEmail,
  updateUserProfile,
  updateUserPassword,
  touchLastLogin,
  getEffectivePermissions,
  completePasswordReset,
} from '../services/userService.js';
import { recordAudit } from '../services/auditService.js';
import { assertLoginNotLocked, clearFailedLogin, enforcePasswordPolicy, getSecuritySettings, recordFailedLogin } from '../services/securityControlService.js';

const publicUser = (user, permissions) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  bio: user.bio,
  avatarUrl: user.avatar_url,
  isActive: Boolean(user.is_active),
  createdAt: user.created_at,
  permissions,
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (await findUserByEmail(email)) {
    throw conflict('An account with that email already exists.', 'EMAIL_IN_USE');
  }

  const securitySettings = await enforcePasswordPolicy(password);
  const passwordHash = await hashPassword(password);
  // Role is hard-coded to "user": self-registration can never create an admin.
  const user = await createUser({ name, email, passwordHash, role: 'user' });

  const token = signToken(user, `${securitySettings.token_expiry_minutes}m`);
  await recordAudit({
    userId: user.id,
    actorRole: user.role,
    action: 'USER_REGISTERED',
    entity: 'user',
    entityId: user.id,
    req,
  });

  const permissions = await getEffectivePermissions(user.role, user.id);
  res.status(201).json({
    success: true,
    data: { token, user: publicUser(user, permissions) },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  try {
    await assertLoginNotLocked(email);
  } catch (error) {
    await recordAudit({ action: 'LOGIN_BLOCKED', entity: 'user', req, metadata: { reason: 'lockout' } });
    throw error;
  }
  const user = await findUserWithSecretByEmail(email);

  // Same generic message whether the email or the password is wrong.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const attempt = await recordFailedLogin(email);
    await recordAudit({
      action: 'LOGIN_FAILED', entity: 'user', entityId: user?.id ?? null, req,
      metadata: { attempt: attempt.count, locked: Boolean(attempt.lockedUntil) },
    });
    throw unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  }
  if (!user.is_active) {
    throw unauthorized('This account has been disabled.', 'ACCOUNT_DISABLED');
  }

  await touchLastLogin(user.id);
  await clearFailedLogin(email);
  const securitySettings = await getSecuritySettings();
  const token = signToken(user, `${securitySettings.token_expiry_minutes}m`);
  const permissions = await getEffectivePermissions(user.role, user.id);

  await recordAudit({
    userId: user.id,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entity: 'user',
    entityId: user.id,
    req,
  });

  const safe = await findUserById(user.id);
  res.json({ success: true, data: { token, user: publicUser(safe, permissions) } });
});

export const me = asyncHandler(async (req, res) => {
  const user = await findUserById(req.auth.id);
  res.json({
    success: true,
    data: { user: publicUser(user, req.auth.permissions) },
  });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { name, email, bio, avatarUrl } = req.body;

  if (email && email !== req.auth.user.email) {
    const existing = await findUserByEmail(email);
    if (existing && Number(existing.id) !== Number(req.auth.id)) {
      throw conflict('That email address is already in use.', 'EMAIL_IN_USE');
    }
  }

  await updateUserProfile(req.auth.id, { name, email, bio, avatar_url: avatarUrl });
  const user = await findUserById(req.auth.id);
  const permissions = await getEffectivePermissions(user.role, user.id);

  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'PROFILE_UPDATED',
    entity: 'user',
    entityId: req.auth.id,
    req,
  });

  res.json({ success: true, data: { user: publicUser(user, permissions) } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await findUserWithSecretByEmail(req.auth.user.email);

  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw unauthorized('Your current password is incorrect.', 'INVALID_PASSWORD');
  }

  await enforcePasswordPolicy(newPassword);
  await updateUserPassword(user.id, await hashPassword(newPassword));
  await recordAudit({
    userId: user.id,
    actorRole: user.role,
    action: 'PASSWORD_CHANGED',
    entity: 'user',
    entityId: user.id,
    req,
  });

  res.json({ success: true, data: { message: 'Password updated successfully.' } });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await enforcePasswordPolicy(newPassword);
  const userId = await completePasswordReset(tokenHash, await hashPassword(newPassword));
  if (!userId) throw badRequest('This password reset link is invalid or has expired.', 'INVALID_RESET_TOKEN');
  await recordAudit({ userId, actorRole: 'user', action: 'PASSWORD_RESET_COMPLETED', entity: 'user', entityId: userId, req });
  res.json({ success: true, data: { message: 'Password reset successfully. You can now sign in.' } });
});

/**
 * Logout is intentionally stateless: the JWT is discarded by the client.
 * We still write an audit entry so the security log reflects the session end.
 */
export const logout = asyncHandler(async (req, res) => {
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'USER_LOGOUT',
    entity: 'user',
    entityId: req.auth.id,
    req,
  });
  res.json({ success: true, data: { message: 'Signed out.' } });
});

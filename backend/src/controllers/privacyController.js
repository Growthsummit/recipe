import { asyncHandler, unauthorized } from '../utils/errors.js';
import { findUserWithSecretByEmail } from '../services/userService.js';
import { verifyPassword } from '../utils/password.js';
import { eraseUserAccount, exportUserData, getUserConsents, updateUserConsents } from '../services/privacyService.js';
import { recordAudit } from '../services/auditService.js';

export const exportMyDataHandler = asyncHandler(async (req, res) => {
  const data = await exportUserData(req.auth.id);
  res.json({ success: true, data: { export: data } });
});

export const getMyConsentsHandler = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { consents: await getUserConsents(req.auth.id) } });
});

export const updateMyConsentsHandler = asyncHandler(async (req, res) => {
  const consents = await updateUserConsents(req.auth.id, req.body);
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'CONSENT_UPDATED', entity: 'user_consent', entityId: req.auth.id, req, metadata: { keys: Object.keys(req.body) } });
  res.json({ success: true, data: { consents } });
});

export const deleteMyAccountHandler = asyncHandler(async (req, res) => {
  const user = await findUserWithSecretByEmail(req.auth.user.email);
  if (!user || !(await verifyPassword(req.body.password, user.password_hash))) {
    throw unauthorized('Password confirmation failed.', 'INVALID_PASSWORD');
  }
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'USER_ACCOUNT_DELETED', entity: 'user', entityId: req.auth.id, req, metadata: { method: 'self_service' } });
  await eraseUserAccount(req.auth.id);
  res.json({ success: true, data: { deleted: true, message: 'Your account and associated personal data have been deleted.' } });
});

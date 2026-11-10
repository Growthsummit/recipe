import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission, requireRole, requireSecurityAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  getUserHandler,
  listRolePermissionsHandler,
  updateRolePermissionHandler,
  grantPermissionHandler,
  listAuditLogsHandler,
  listPermissionsHandler,
  listUsersHandler,
  revokePermissionHandler,
  updateUserActiveHandler,
  updateUserRoleHandler,
  sendUserPasswordResetHandler,
} from '../controllers/adminController.js';
import {
  auditQuerySchema,
  listUsersQuerySchema,
  permissionSchema,
  updateActiveSchema,
  updateRoleSchema,
} from '../validators/userValidators.js';
import { z } from 'zod';
import { getDataClassificationHandler, getSecurityDashboardHandler, getSecuritySettingsHandler, updateSecuritySettingsHandler } from '../controllers/securityController.js';
import { rolePermissionSchema, securitySettingsSchema } from '../validators/securityValidators.js';

const router = Router();
const userIdParam = z.object({ id: z.coerce.number().int().positive() });
const userPermissionParam = z.object({
  id: z.coerce.number().int().positive(),
  permission: z.string().regex(/^[a-z_]+:[a-z_]+(:[a-z_]+)?$/),
});

// Every route below requires a valid token plus a role/permission check.
router.use(authenticate);

router.get('/users', requireRole('admin', 'security_admin'), requirePermission('user:read'), validate({ query: listUsersQuerySchema }), listUsersHandler);
router.get('/users/:id', requireRole('admin', 'security_admin'), requirePermission('user:read'), validate({ params: userIdParam }), getUserHandler);
router.patch(
  '/users/:id/role',
  requireRole('admin', 'security_admin'),
  requirePermission('user:manage'),
  validate({ params: userIdParam, body: updateRoleSchema }),
  updateUserRoleHandler
);
router.patch(
  '/users/:id/active',
  requireRole('admin', 'security_admin'),
  requirePermission('user:manage'),
  validate({ params: userIdParam, body: updateActiveSchema }),
  updateUserActiveHandler
);
router.post('/users/:id/password-reset', requireRole('admin', 'security_admin'), requirePermission('user:manage'), validate({ params: userIdParam }), sendUserPasswordResetHandler);

router.get(
  '/users/:id/permissions',
  requireSecurityAdmin,
  requirePermission('permission:read'),
  validate({ params: userIdParam }),
  listPermissionsHandler
);
router.post(
  '/users/:id/permissions',
  requireSecurityAdmin,
  requirePermission('permission:manage'),
  validate({ params: userIdParam, body: permissionSchema }),
  grantPermissionHandler
);
router.delete(
  '/users/:id/permissions/:permission',
  requireSecurityAdmin,
  requirePermission('permission:manage'),
  validate({ params: userPermissionParam }),
  revokePermissionHandler
);

router.get('/audit-logs', requireRole('admin', 'security_admin'), requirePermission('audit:read'), validate({ query: auditQuerySchema }), listAuditLogsHandler);
router.get('/security/dashboard', requireSecurityAdmin, requirePermission('security:read'), getSecurityDashboardHandler);
router.get('/security/settings', requireSecurityAdmin, requirePermission('security:configure'), getSecuritySettingsHandler);
router.put('/security/settings', requireSecurityAdmin, requirePermission('security:configure'), validate({ body: securitySettingsSchema }), updateSecuritySettingsHandler);
router.get('/role-permissions', requireSecurityAdmin, requirePermission('permission:read'), listRolePermissionsHandler);
router.put('/role-permissions', requireSecurityAdmin, requirePermission('permission:manage'), validate({ body: rolePermissionSchema }), updateRolePermissionHandler);
router.get('/data-classification', requireSecurityAdmin, requirePermission('classification:read'), getDataClassificationHandler);

export default router;

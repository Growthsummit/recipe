import { forbidden } from '../utils/errors.js';
import { ASSIGNABLE_ROLES, ROLES } from '../config/roles.js';

/** Require the authenticated user to hold at least one of the given roles. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.auth) return next(forbidden('Authentication required.', 'AUTH_MISSING'));
  if (!roles.includes(req.auth.role)) {
    return next(forbidden('Your role does not allow this action.', 'ROLE_FORBIDDEN'));
  }
  return next();
};

/** Require the authenticated user to hold a specific permission. */
export const requirePermission = (permission) => (req, _res, next) => {
  if (!req.auth) return next(forbidden('Authentication required.', 'AUTH_MISSING'));
  if (!req.auth.permissions.includes(permission)) {
    return next(forbidden(`Missing permission: ${permission}`, 'PERMISSION_FORBIDDEN'));
  }
  return next();
};

export const requireAdmin = requireRole(ROLES.ADMIN, ROLES.SECURITY_ADMIN);
export const requireSecurityAdmin = requireRole(ROLES.SECURITY_ADMIN);

/** Only these roles may ever be assigned through the API. */
export const isAssignableRole = (role) => ASSIGNABLE_ROLES.includes(role);

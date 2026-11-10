/**
 * Role based access control.
 *
 * Four actors are supported (matching the frontend RBAC matrix):
 *   guest            - not signed in (never stored in the users table)
 *   user             - a normal signed-in member
 *   admin            - Administrator: manages recipes and users
 *   security_admin   - Security Administrator: manages permissions and reads security logs
 */

export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
  SECURITY_ADMIN: 'security_admin',
};

/** Roles that can be persisted on a user account. */
export const ASSIGNABLE_ROLES = [ROLES.USER, ROLES.ADMIN, ROLES.SECURITY_ADMIN];

export const ROLE_LABELS = {
  [ROLES.GUEST]: 'Guest',
  [ROLES.USER]: 'User',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.SECURITY_ADMIN]: 'Security Administrator',
};

const USER_PERMISSIONS = [
  'recipe:read',
  'recipe:create',
  'recipe:update:own',
  'recipe:delete:own',
  'category:read',
  'favourite:manage',
  'rating:manage',
  'review:create',
  'review:update:own',
  'review:delete:own',
  'history:manage',
  'preference:manage',
  'profile:manage',
];

const ADMIN_PERMISSIONS = [
  ...USER_PERMISSIONS,
  'recipe:update:any',
  'recipe:delete:any',
  'recipe:publish',
  'category:manage',
  'review:update:any',
  'review:delete:any',
  'user:read',
  'user:manage',
  'audit:read',
];

const SECURITY_ADMIN_PERMISSIONS = [
  ...USER_PERMISSIONS,
  'recipe:read',
  'category:read',
  'profile:manage',
  'user:read',
  'user:manage',
  'permission:read',
  'permission:manage',
  'audit:read',
  'security:read',
  'security:configure',
  'classification:read',
];

export const ROLE_PERMISSIONS = {
  [ROLES.GUEST]: ['recipe:read', 'category:read'],
  [ROLES.USER]: USER_PERMISSIONS,
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.SECURITY_ADMIN]: SECURITY_ADMIN_PERMISSIONS,
};

/** Union of the role's built-in permissions and any extra rows in user_permissions. */
export function resolvePermissions(role, extraPermissions = []) {
  const base = ROLE_PERMISSIONS[role] || [];
  return Array.from(new Set([...base, ...extraPermissions]));
}

export function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

/** A user may manage their own profile but never change their own role. */
export const SELF_UPDATABLE_PROFILE_FIELDS = ['name', 'bio', 'avatar_url', 'email'];

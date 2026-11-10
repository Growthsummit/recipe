import { verifyToken } from '../utils/tokens.js';
import { findUserById, getEffectivePermissions, getRolePermissions } from '../services/userService.js';
import { ROLES } from '../config/roles.js';
import { AppError, unauthorized } from '../utils/errors.js';

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

async function buildAuthContext(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw unauthorized('Your session is invalid or has expired. Please sign in again.', 'TOKEN_INVALID');
  }

  const user = await findUserById(Number(payload.sub));
  if (!user) throw unauthorized('The account for this session no longer exists.', 'USER_MISSING');
  if (!user.is_active) throw unauthorized('This account has been disabled.', 'ACCOUNT_DISABLED');

  // The role is trusted from the DATABASE, never from the request body/headers.
  return {
    id: user.id,
    role: user.role,
    permissions: await getEffectivePermissions(user.role, user.id),
    user,
  };
}

/** Hard gate: a valid token is mandatory. */
export async function authenticate(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) throw unauthorized('Authentication required.', 'TOKEN_MISSING');
    req.auth = await buildAuthContext(token);
    next();
  } catch (error) {
    next(error);
  }
}

/** Soft gate: attach req.auth when a valid token exists, otherwise continue as guest. */
export async function optionalAuthenticate(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    req.auth = token ? await buildAuthContext(token) : { id: null, role: ROLES.GUEST, permissions: await getRolePermissions(ROLES.GUEST), user: null };
    next();
  } catch (error) {
    // A bad token on a public endpoint simply means "treated as guest".
    if (error instanceof AppError && error.statusCode === 401) {
      req.auth = { id: null, role: ROLES.GUEST, permissions: await getRolePermissions(ROLES.GUEST), user: null };
      return next();
    }
    next(error);
  }
}

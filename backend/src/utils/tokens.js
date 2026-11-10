import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * Signed JWTs only ever carry the user's public id and role.
 * Role/permission data is re-read from the database on every request, so a
 * stale token can never be used to keep elevated access.
 */
export function signToken(user, expiresIn = config.jwt.expiresIn) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwt.secret, {
    expiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

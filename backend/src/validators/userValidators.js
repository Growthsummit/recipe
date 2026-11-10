import { z } from 'zod';
import { ASSIGNABLE_ROLES } from '../config/roles.js';

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    role: z.enum(ASSIGNABLE_ROLES, {
      errorMap: () => ({ message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` }),
    }),
  })
  .strict();

export const updateActiveSchema = z
  .object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  })
  .strict();

/** A permission is "resource:action" or "resource:action:scope". */
export const permissionSchema = z
  .object({
    permission: z
      .string({ required_error: 'Permission is required' })
      .trim()
      .regex(/^[a-z_]+:[a-z_]+(:[a-z_]+)?$/, 'Permission must look like "recipe:update:own"'),
  })
  .strict();

export const auditQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    action: z.string().trim().max(60).optional(),
    userId: z.coerce.number().int().positive().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

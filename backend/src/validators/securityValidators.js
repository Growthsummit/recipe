import { z } from 'zod';
import { ASSIGNABLE_ROLES } from '../config/roles.js';

export const securitySettingsSchema = z.object({
  password_min_length: z.coerce.number().int().min(8).max(64).optional(),
  password_require_letter: z.boolean().optional(),
  password_require_number: z.boolean().optional(),
  login_max_attempts: z.coerce.number().int().min(3).max(20).optional(),
  lockout_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  token_expiry_minutes: z.coerce.number().int().min(5).max(43200).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one setting to update.' });

export const rolePermissionSchema = z.object({
  role: z.enum(['guest', ...ASSIGNABLE_ROLES]),
  permission: z.string().trim().regex(/^[a-z_]+:[a-z_]+(:[a-z_]+)?$/),
  enabled: z.boolean(),
}).strict();

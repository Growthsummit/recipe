import { z } from 'zod';

export const consentSchema = z.object({
  analytics: z.boolean().optional(),
  marketing: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'Choose at least one consent setting.' });

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
}).strict();

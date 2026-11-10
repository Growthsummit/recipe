import { z } from 'zod';

export const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Please provide a valid email address')
  .max(160, 'Email is too long');

export const passwordField = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')

export const registerSchema = z
  .object({
    name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name is too short').max(80),
    email: emailField,
    password: passwordField,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailField,
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80).optional(),
    email: emailField.optional(),
    bio: z.string().trim().max(500, 'Bio is too long').nullable().optional(),
    avatarUrl: z.string().trim().url('Avatar must be a valid URL').max(500).nullable().optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: 'Current password is required' }).min(1),
    newPassword: passwordField,
  })
  .strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: passwordField,
}).strict();

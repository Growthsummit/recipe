import { z } from 'zod';

export const favouriteParamSchema = z.object({
  recipeId: z.coerce.number().int().positive('Recipe id must be a positive integer'),
});

export const ratingSchema = z
  .object({
    rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  })
  .strict();

export const reviewSchema = z
  .object({
    body: z.string({ required_error: 'Review text is required' }).trim().min(3, 'Review is too short').max(2000, 'Review is too long'),
    rating: z.coerce.number().int().min(1).max(5).optional(),
  })
  .strict();

export const cookingHistorySchema = z
  .object({
    servings: z.coerce.number().int().positive().max(50).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const preferencesSchema = z
  .object({
    dietaryPreferences: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    theme: z.enum(['light', 'dark']).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    measurementUnits: z.enum(['metric', 'imperial']).optional(),
    emailNotifications: z.boolean().optional(),
  })
  .strict();

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Id must be a positive integer'),
});

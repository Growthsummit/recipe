import { z } from 'zod';

const dietaryValue = z.string().trim().min(1).max(40);

/** Accept either "200 g pasta" or a structured { displayText, quantity, unit, name }. */
export const ingredientInput = z.union([
  z.string().trim().min(1, 'Ingredient text cannot be empty').max(160),
  z
    .object({
      displayText: z.string().trim().min(1).max(160).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      quantity: z.string().trim().max(40).optional(),
      unit: z.string().trim().max(40).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.displayText || value.name), {
      message: 'Ingredient needs a displayText or name',
    }),
]);

/** Accept either "Cook the pasta" or a structured { title, text }. */
export const instructionInput = z.union([
  z.string().trim().min(1).max(1000),
  z
    .object({
      title: z.string().trim().max(120).optional(),
      text: z.string().trim().min(1, 'Step text is required').max(1000),
    })
    .strict(),
]);

const recipeBody = {
  title: z.string({ required_error: 'Title is required' }).trim().min(2, 'Title is too short').max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  categorySlug: z.string().trim().max(80).nullable().optional(),
  imageUrl: z.string().trim().max(1000).nullable().optional(),
  cookingTimeMinutes: z.coerce
    .number()
    .int('Cooking time must be a whole number of minutes')
    .min(1)
    .max(1440)
    .nullable()
    .optional(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).nullable().optional(),
  servings: z.string().trim().max(60).nullable().optional(),
  dietaryInfo: z.array(dietaryValue).max(20).optional(),
  ingredients: z.array(ingredientInput).max(60).optional(),
  instructions: z.array(instructionInput).max(60).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isPublished: z.boolean().optional(),
};

export const createRecipeSchema = z
  .object({
    ...recipeBody,
    // The frontend historically sends `time` and `rating`-free payloads; accept `time` too.
    time: z.string().trim().max(40).optional(),
    steps: z.array(instructionInput).max(60).optional(),
  })
  .strict();

export const updateRecipeSchema = z
  .object(recipeBody)
  .partial()
  .strict();

export const listRecipesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
    q: z.string().trim().max(120).optional(),
    category: z.string().trim().max(80).optional(),
    ingredient: z.string().trim().max(120).optional(),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
    dietary: z.string().trim().max(60).optional(),
    maxTime: z.coerce.number().int().positive().max(1440).optional(),
    minTime: z.coerce.number().int().positive().max(1440).optional(),
    sort: z.enum(['newest', 'oldest', 'rating', 'time', 'popular', 'title']).optional(),
    authorId: z.coerce.number().int().positive().optional(),
    includeUnpublished: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const categorySchema = z
  .object({
    name: z.string({ required_error: 'Name is required' }).trim().min(2).max(60),
    emoji: z.string().trim().max(8).nullable().optional(),
    description: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

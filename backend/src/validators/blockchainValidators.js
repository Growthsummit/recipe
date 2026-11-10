import { z } from 'zod';

export const blockchainRecipeParams = z.object({ id: z.coerce.number().int().positive() });
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a 32-byte hex value.');

export const walletChallengeSchema = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).strict();
export const walletVerifySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().regex(/^[0-9a-fA-F]{64}$/),
  message: z.string().min(40).max(500),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
}).strict();
export const blockchainSubmissionSchema = z.object({
  version: z.coerce.number().int().positive().max(2_147_483_647),
  contentHash: hash,
  transactionHash: hash,
}).strict();
export const blockchainConfirmationSchema = blockchainSubmissionSchema;
export const blockchainFailureSchema = z.object({
  version: z.coerce.number().int().positive().max(2_147_483_647),
  message: z.string().trim().max(180).optional(),
}).strict();
export const transactionParams = z.object({ txHash: hash });

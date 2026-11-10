import { asyncHandler } from '../utils/errors.js';
import { recordAudit } from '../services/auditService.js';
import {
  confirmRecipeRegistration,
  createWalletChallenge,
  getBlockchainDashboard,
  getLinkedWallet,
  getRecipeBlockchainHistory,
  lookupBlockchainTransaction,
  markRegistrationFailed,
  prepareRecipeRegistration,
  recordSubmittedTransaction,
  verifyAndLinkWallet,
  verifyCurrentRecipe,
} from '../services/blockchainService.js';

export const myWalletHandler = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { wallet: await getLinkedWallet(req.auth.id) } });
});

export const walletChallengeHandler = asyncHandler(async (req, res) => {
  const challenge = await createWalletChallenge(req.auth.id, req.body.address);
  res.json({ success: true, data: { challenge } });
});

export const verifyWalletHandler = asyncHandler(async (req, res) => {
  const wallet = await verifyAndLinkWallet(req.auth.id, req.body);
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'BLOCKCHAIN_WALLET_LINKED', entity: 'user_wallet', req, metadata: { address: wallet.address } });
  res.json({ success: true, data: { wallet } });
});

export const prepareRegistrationHandler = asyncHandler(async (req, res) => {
  const prepared = await prepareRecipeRegistration(req.auth.id, Number(req.params.id));
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'BLOCKCHAIN_REGISTRATION_PREPARED', entity: 'recipe', entityId: req.params.id, req, metadata: { version: prepared.version, contentHash: prepared.contentHash } });
  res.status(201).json({ success: true, data: { registration: prepared } });
});

export const submittedTransactionHandler = asyncHandler(async (req, res) => {
  const result = await recordSubmittedTransaction(req.auth.id, Number(req.params.id), req.body);
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'BLOCKCHAIN_TRANSACTION_SUBMITTED', entity: 'recipe', entityId: req.params.id, req, metadata: { version: req.body.version, transactionHash: result.transactionHash } });
  res.status(202).json({ success: true, data: { registration: result } });
});

export const confirmRegistrationHandler = asyncHandler(async (req, res) => {
  const result = await confirmRecipeRegistration(req.auth.id, Number(req.params.id), req.body);
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'BLOCKCHAIN_TRANSACTION_CONFIRMED', entity: 'recipe', entityId: req.params.id, req, metadata: { version: req.body.version, transactionHash: result.transactionHash, isCurrentContent: result.isCurrentContent } });
  res.json({ success: true, data: { registration: result } });
});

export const failedRegistrationHandler = asyncHandler(async (req, res) => {
  const result = await markRegistrationFailed(req.auth.id, Number(req.params.id), req.body);
  await recordAudit({ userId: req.auth.id, actorRole: req.auth.role, action: 'BLOCKCHAIN_REGISTRATION_FAILED', entity: 'recipe', entityId: req.params.id, req, metadata: { version: req.body.version } });
  res.json({ success: true, data: { registration: result } });
});

export const verifyRecipeHandler = asyncHandler(async (req, res) => {
  const result = await verifyCurrentRecipe(req.auth, Number(req.params.id));
  res.json({ success: true, data: { verification: result } });
});

export const recipeHistoryHandler = asyncHandler(async (req, res) => {
  const result = await getRecipeBlockchainHistory(req.auth, Number(req.params.id));
  res.json({ success: true, data: { history: result } });
});

export const transactionLookupHandler = asyncHandler(async (req, res) => {
  const result = await lookupBlockchainTransaction(req.auth, req.params.txHash);
  res.json({ success: true, data: { transaction: result } });
});

export const blockchainDashboardHandler = asyncHandler(async (req, res) => {
  const dashboard = await getBlockchainDashboard(req.auth);
  res.json({ success: true, data: { dashboard } });
});

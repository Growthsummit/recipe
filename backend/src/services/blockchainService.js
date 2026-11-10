import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Contract, Interface, JsonRpcProvider, ZeroAddress, ZeroHash, getAddress, isAddress, verifyMessage } from 'ethers';
import { config } from '../config/env.js';
import { execute, queryAll, queryOne } from '../config/database.js';
import { badRequest, conflict, forbidden, notFound, AppError } from '../utils/errors.js';
import { getCanonicalRecipe, sha256Recipe } from '../blockchain/canonicalRecipe.js';
import { RECIPE_REGISTRY_ABI } from '../blockchain/recipeRegistryAbi.js';

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const closeProvider = (provider) => { try { provider.destroy(); } catch { /* already closed */ } };

// --- Adapters for the deployed Sepolia RecipeRegistry (0x5a9c...fdba7b) -----------------------
// The contract reverts with "Recipe not found" for unknown IDs instead of returning zeros.
const isNotFound = (error) => String(error?.reason ?? error?.shortMessage ?? error?.message ?? '').includes('Recipe not found');

// Pseudonymous creator reference stored on-chain: a salted HMAC of the user ID, never personal data.
const creatorRef = (userId) =>
  `0x${createHmac('sha256', process.env.USER_REF_SALT || 'recipehub-user-ref').update(String(userId), 'utf8').digest('hex')}`;

async function currentContractRecipe(contract, recipeId) {
  try {
    const record = await contract.getRecipe(BigInt(recipeId));
    return { creatorWallet: getAddress(record[0]), version: Number(record[4]) };
  } catch (error) {
    if (isNotFound(error)) return { creatorWallet: ZeroAddress, version: 0 };
    throw error;
  }
}

// Returns { contentHash, registeredAt, exists } for one version, read from the contract history.
async function getVersionProof(contract, recipeId, version) {
  try {
    const history = await contract.getRecipeHistory(BigInt(recipeId));
    const entry = Number(version) >= 1 ? history[Number(version) - 1] : undefined;
    if (!entry) return { contentHash: ZeroHash, registeredAt: 0, exists: false };
    return { contentHash: entry[0], registeredAt: Number(entry[1]), exists: true };
  } catch (error) {
    if (isNotFound(error)) return { contentHash: ZeroHash, registeredAt: 0, exists: false };
    throw error;
  }
}

async function verifyVersionHash(contract, recipeId, version, expectedHash) {
  const proof = await getVersionProof(contract, recipeId, version);
  return proof.exists && String(proof.contentHash).toLowerCase() === String(expectedHash).toLowerCase();
}
// ----------------------------------------------------------------------------------------------

function requireConfiguration() {
  if (config.blockchain.network !== 'sepolia' || config.blockchain.chainId !== 11155111) {
    throw new AppError(503, 'RecipeHub blockchain is configured for Ethereum Sepolia only.', 'BLOCKCHAIN_NETWORK_UNSUPPORTED');
  }
  if (!config.blockchain.rpcUrl || !isAddress(config.blockchain.contractAddress)) {
    throw new AppError(503, 'Sepolia RPC URL and deployed contract address must be configured by the operator.', 'BLOCKCHAIN_NOT_CONFIGURED');
  }
}

async function getRegistry() {
  requireConfiguration();
  const provider = new JsonRpcProvider(config.blockchain.rpcUrl, config.blockchain.chainId, { staticNetwork: true });
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 11155111) throw new AppError(503, 'Configured RPC is not connected to Sepolia.', 'BLOCKCHAIN_CHAIN_MISMATCH');
  } catch (error) {
    closeProvider(provider);
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'Sepolia RPC is unavailable.', 'BLOCKCHAIN_RPC_UNAVAILABLE');
  }
  const address = getAddress(config.blockchain.contractAddress);
  const code = await provider.getCode(address).catch((error) => {
    closeProvider(provider);
    throw new AppError(503, 'Sepolia RPC could not read the configured contract address.', 'BLOCKCHAIN_CONTRACT_UNAVAILABLE');
  });
  if (code === '0x') {
    closeProvider(provider);
    throw new AppError(503, 'No contract is deployed at the configured Sepolia address.', 'BLOCKCHAIN_CONTRACT_NOT_DEPLOYED');
  }
  return { provider, contract: new Contract(address, RECIPE_REGISTRY_ABI, provider), address };
}

function challengeMessage(userId, address, nonce, expiresAt) {
  return `RecipeHub Sepolia wallet verification\nAccount ID: ${userId}\nWallet: ${getAddress(address)}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
}

export async function getLinkedWallet(userId) {
  return queryOne('SELECT address,verified_at AS verifiedAt FROM user_wallets WHERE user_id=?', [userId]);
}

export async function createWalletChallenge(userId, addressInput) {
  if (!isAddress(addressInput)) throw badRequest('Provide a valid Ethereum wallet address.', 'WALLET_ADDRESS_INVALID');
  const address = getAddress(addressInput);
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const message = challengeMessage(userId, address, nonce, expiresAt);
  await execute('DELETE FROM wallet_challenges WHERE used_at IS NOT NULL OR expires_at < ?', [new Date().toISOString()]);
  await execute(
    'INSERT INTO wallet_challenges(user_id,address,nonce_hash,expires_at) VALUES(?,?,?,?)',
    [userId, address, sha256(nonce), expiresAt]
  );
  return { address, message, expiresAt };
}

export async function verifyAndLinkWallet(userId, { address: addressInput, nonce, message, signature }) {
  if (!isAddress(addressInput) || !/^[0-9a-f]{64}$/i.test(nonce)) throw badRequest('Wallet challenge is invalid.', 'WALLET_CHALLENGE_INVALID');
  const address = getAddress(addressInput);
  const challenge = await queryOne(
    `SELECT id,expires_at AS expiresAt FROM wallet_challenges
      WHERE user_id=? AND address=? AND nonce_hash=? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
    [userId, address, sha256(nonce)]
  );
  if (!challenge || Date.parse(challenge.expiresAt) <= Date.now() || message !== challengeMessage(userId, address, nonce, challenge.expiresAt)) {
    throw badRequest('Wallet challenge has expired or does not match this account.', 'WALLET_CHALLENGE_INVALID');
  }
  let signer;
  try { signer = getAddress(verifyMessage(message, signature)); }
  catch { throw badRequest('The wallet signature could not be verified.', 'WALLET_SIGNATURE_INVALID'); }
  if (signer !== address) throw forbidden('The signature does not belong to the submitted wallet.', 'WALLET_SIGNATURE_MISMATCH');
  const alreadyUsed = await queryOne('SELECT user_id FROM user_wallets WHERE address=? COLLATE NOCASE', [address]);
  if (alreadyUsed && Number(alreadyUsed.user_id) !== Number(userId)) throw conflict('That wallet is already linked to another RecipeHub account.', 'WALLET_ALREADY_LINKED');
  const consumed = await execute('UPDATE wallet_challenges SET used_at=datetime(\'now\') WHERE id=? AND used_at IS NULL', [challenge.id]);
  if (Number(consumed.rowsAffected) !== 1) throw badRequest('Wallet challenge has already been used.', 'WALLET_CHALLENGE_USED');
  await execute(
    `INSERT INTO user_wallets(user_id,address) VALUES(?,?)
     ON CONFLICT(user_id) DO UPDATE SET address=excluded.address,verified_at=datetime('now')`,
    [userId, address]
  );
  return getLinkedWallet(userId);
}

async function assertOwnPublishedRecipe(userId, recipeId) {
  const recipe = await getCanonicalRecipe(recipeId);
  if (!recipe) throw notFound('Recipe not found.', 'RECIPE_NOT_FOUND');
  if (Number(recipe.author_id) !== Number(userId)) throw forbidden('Blockchain registration is limited to the recipe owner.', 'RECIPE_NOT_OWNED');
  if (!recipe.is_published || recipe.status !== 'published') throw conflict('Publish the recipe before registering its integrity proof.', 'RECIPE_NOT_PUBLISHED');
  return recipe;
}

export async function prepareRecipeRegistration(userId, recipeId) {
  const recipe = await assertOwnPublishedRecipe(userId, recipeId);
  const wallet = await getLinkedWallet(userId);
  if (!wallet) throw conflict('Connect and verify a wallet before registering this recipe.', 'WALLET_NOT_LINKED');
  const { provider, contract, address } = await getRegistry();
  try {
    const onChain = await currentContractRecipe(contract, recipeId);
    if (onChain.version > 0 && onChain.creatorWallet !== getAddress(wallet.address)) {
      throw forbidden('The linked wallet is not the creator wallet already registered for this recipe.', 'BLOCKCHAIN_CREATOR_MISMATCH');
    }
    const contentHash = sha256Recipe(recipe);
    if (onChain.version > 0) {
      const currentProof = await getVersionProof(contract, recipeId, onChain.version);
      if (currentProof.exists && String(currentProof.contentHash).toLowerCase() === contentHash.toLowerCase()) {
        const submitted = await queryOne(
          'SELECT transaction_hash AS transactionHash,status FROM blockchain_records WHERE recipe_id=? AND recipe_version=?',
          [recipeId, onChain.version]
        );
        if (submitted?.status === 'pending' && submitted.transactionHash) {
          await confirmRecipeRegistration(userId, recipeId, { version: onChain.version, contentHash, transactionHash: submitted.transactionHash });
        }
        return { recipeId: Number(recipeId), version: onChain.version, contentHash, walletAddress: getAddress(wallet.address),
          contractAddress: address, network: 'sepolia', chainId: 11155111, alreadyRegistered: true };
      }
    }
    const version = onChain.version + 1;
    const existing = await queryOne(
      'SELECT id,content_hash AS contentHash,status,transaction_hash AS transactionHash FROM blockchain_records WHERE recipe_id=? AND recipe_version=?',
      [recipeId, version]
    );
    if (existing?.status === 'confirmed') throw conflict('This recipe version is already registered.', 'RECIPE_VERSION_ALREADY_REGISTERED');
    if (existing?.status === 'pending' && existing.transactionHash) throw conflict('A transaction for this recipe version is already pending. Verify it before retrying.', 'REGISTRATION_TRANSACTION_PENDING');
    if (existing) {
      await execute(
        `UPDATE blockchain_records SET event_type=?,actor_pseudonym=?,hash=?,content_hash=?,transaction_hash=NULL,
          contract_address=?,network_name='sepolia',creator_wallet=?,status='pending',payload=?,confirmed_at=NULL
          WHERE id=?`,
        [version === 1 ? 'RECIPE_REGISTER_PENDING' : 'RECIPE_VERSION_PENDING', wallet.address.toLowerCase(), contentHash, contentHash, address, wallet.address, JSON.stringify({ chainId: 11155111 }), existing.id]
      );
    } else {
      const nextBlock = await queryOne('SELECT COALESCE(MAX(block_index),0)+1 AS next FROM blockchain_records');
      await execute(
        `INSERT INTO blockchain_records(block_index,event_type,recipe_id,actor_pseudonym,prev_hash,hash,nonce,payload,
          recipe_version,content_hash,contract_address,network_name,creator_wallet,status)
         VALUES(?,?,?, ?,NULL,?,0, ?,?,?,?,'sepolia',?,'pending')`,
        [nextBlock.next, version === 1 ? 'RECIPE_REGISTER_PENDING' : 'RECIPE_VERSION_PENDING', recipeId, wallet.address.toLowerCase(), contentHash,
          JSON.stringify({ chainId: 11155111 }), version, contentHash, address, wallet.address]
      );
    }
    // `method` and `args` tell the frontend exactly which contract call to send from the user's wallet.
    // registerRecipe(recipeId, recipeHash, creatorRef)  |  updateRecipe(recipeId, newHash)
    const method = version === 1 ? 'registerRecipe' : 'updateRecipe';
    const args = version === 1
      ? [String(recipeId), contentHash, creatorRef(userId)]
      : [String(recipeId), contentHash];
    return {
      recipeId: Number(recipeId), version, contentHash, walletAddress: getAddress(wallet.address),
      contractAddress: address, network: 'sepolia', chainId: 11155111,
      method, args,
    };
  } finally { closeProvider(provider); }
}

export async function recordSubmittedTransaction(userId, recipeId, { version, contentHash, transactionHash }) {
  if (!TX_HASH_PATTERN.test(transactionHash || '')) throw badRequest('Transaction hash must be a 32-byte Ethereum hash.', 'TRANSACTION_HASH_INVALID');
  const recipe = await assertOwnPublishedRecipe(userId, recipeId);
  const currentHash = sha256Recipe(recipe);
  if (currentHash !== contentHash) throw conflict('Recipe content changed. Prepare a new blockchain version.', 'RECIPE_CONTENT_CHANGED');
  const wallet = await getLinkedWallet(userId);
  const row = await queryOne('SELECT id,status,content_hash AS contentHash,transaction_hash AS transactionHash FROM blockchain_records WHERE recipe_id=? AND recipe_version=?', [recipeId, version]);
  if (!row || row.status !== 'pending' || row.contentHash !== contentHash) throw conflict('No matching pending blockchain registration exists.', 'REGISTRATION_NOT_PENDING');
  if (!wallet) throw conflict('The verified wallet link is missing.', 'WALLET_NOT_LINKED');
  if (row.transactionHash && row.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
    throw conflict('A different transaction is already pending for this recipe version.', 'REGISTRATION_TRANSACTION_PENDING');
  }
  await execute('UPDATE blockchain_records SET transaction_hash=? WHERE id=? AND status=\'pending\'', [transactionHash.toLowerCase(), row.id]);
  return { transactionHash: transactionHash.toLowerCase(), status: 'pending' };
}

async function verifyReceipt({ provider, contract, address, transactionHash, recipeId, version, contentHash, walletAddress }) {
  if (!TX_HASH_PATTERN.test(transactionHash || '')) throw badRequest('Transaction hash must be a 32-byte Ethereum hash.', 'TRANSACTION_HASH_INVALID');
  const [receipt, transaction] = await Promise.all([provider.getTransactionReceipt(transactionHash), provider.getTransaction(transactionHash)]);
  if (!receipt || !transaction) throw conflict('The Sepolia transaction is not confirmed yet.', 'TRANSACTION_NOT_CONFIRMED');
  if (Number(receipt.status) !== 1) throw conflict('The Sepolia transaction failed.', 'TRANSACTION_FAILED');
  if (!transaction.to || getAddress(transaction.to) !== address || getAddress(transaction.from) !== getAddress(walletAddress)) {
    throw forbidden('The transaction target or signer does not match the registered wallet.', 'TRANSACTION_SENDER_MISMATCH');
  }
  const eventName = Number(version) === 1 ? 'RecipeRegistered' : 'RecipeUpdated';
  const iface = new Interface(RECIPE_REGISTRY_ABI);
  let eventFound = false;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== address) continue;
    try {
      const parsed = iface.parseLog(log);
      if (!parsed || parsed.name !== eventName) continue;
      // Both events share the layout: (recipeId, creator, hash, version, timestamp)
      const [eventRecipeId, eventCreator, eventHash, eventVersion] = parsed.args;
      if (BigInt(eventRecipeId) !== BigInt(recipeId) || Number(eventVersion) !== Number(version)
        || String(eventHash).toLowerCase() !== contentHash.toLowerCase()
        || getAddress(eventCreator) !== getAddress(walletAddress)) continue;
      eventFound = true; break;
    } catch { /* Not an event emitted by RecipeRegistry. */ }
  }
  if (!eventFound) throw conflict('The transaction receipt has no matching RecipeRegistry event.', 'REGISTRY_EVENT_MISMATCH');
  const proof = await getVersionProof(contract, recipeId, version);
  if (!proof.exists || String(proof.contentHash).toLowerCase() !== contentHash.toLowerCase()) {
    throw conflict('The contract does not contain the expected version proof.', 'ONCHAIN_PROOF_MISMATCH');
  }
  return { receipt, blockTimestamp: Number(proof.registeredAt) };
}

export async function confirmRecipeRegistration(userId, recipeId, { version, contentHash, transactionHash }) {
  await assertOwnPublishedRecipe(userId, recipeId);
  const wallet = await getLinkedWallet(userId);
  if (!wallet) throw conflict('The verified wallet link is missing.', 'WALLET_NOT_LINKED');
  const row = await queryOne('SELECT id,status,content_hash AS contentHash,transaction_hash AS transactionHash FROM blockchain_records WHERE recipe_id=? AND recipe_version=?', [recipeId, version]);
  if (!row || row.status !== 'pending' || row.contentHash !== contentHash) throw conflict('No matching pending registration was found.', 'REGISTRATION_NOT_PENDING');
  if (row.transactionHash && row.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) throw conflict('Transaction hash differs from the submitted transaction.', 'TRANSACTION_HASH_MISMATCH');
  const { provider, contract, address } = await getRegistry();
  try {
    const { receipt, blockTimestamp } = await verifyReceipt({ provider, contract, address, transactionHash, recipeId, version, contentHash, walletAddress: wallet.address });
    const current = await getCanonicalRecipe(recipeId);
    const isCurrentContent = sha256Recipe(current) === contentHash;
    await execute(
      `UPDATE blockchain_records SET transaction_hash=?,status='confirmed',event_type=?,confirmed_at=datetime('now'),
        hash=?,content_hash=?,payload=? WHERE id=?`,
      [transactionHash.toLowerCase(), Number(version) === 1 ? 'RECIPE_REGISTERED' : 'RECIPE_VERSION_UPDATED', contentHash, contentHash,
        JSON.stringify({ blockNumber: receipt.blockNumber, blockTimestamp, isCurrentContent }), row.id]
    );
    return { status: 'confirmed', transactionHash: transactionHash.toLowerCase(), blockNumber: receipt.blockNumber, blockTimestamp, isCurrentContent };
  } finally { closeProvider(provider); }
}

export async function markRegistrationFailed(userId, recipeId, { version, message = 'Wallet transaction was rejected or failed.' }) {
  await assertOwnPublishedRecipe(userId, recipeId);
  const safeMessage = String(message).replace(/[\r\n\t]/g, ' ').slice(0, 180);
  const result = await execute(
    `UPDATE blockchain_records SET status='failed',event_type='RECIPE_REGISTRATION_FAILED',payload=?
      WHERE recipe_id=? AND recipe_version=? AND status='pending'`,
    [JSON.stringify({ reason: safeMessage }), recipeId, version]
  );
  if (Number(result.rowsAffected) === 0) throw notFound('Pending registration not found.', 'REGISTRATION_NOT_PENDING');
  return { status: 'failed' };
}

async function assertReadableRecipe(auth, recipeId) {
  const recipe = await getCanonicalRecipe(recipeId);
  if (!recipe) throw notFound('Recipe not found.', 'RECIPE_NOT_FOUND');
  if ((!recipe.is_published || recipe.status !== 'published') && Number(recipe.author_id) !== Number(auth?.id)
      && !['admin', 'security_admin'].includes(auth?.role)) throw notFound('Recipe not found.', 'RECIPE_NOT_FOUND');
  return recipe;
}

export async function getRecipeBlockchainHistory(auth, recipeId) {
  const recipe = await getCanonicalRecipe(recipeId);
  if (recipe) await assertReadableRecipe(auth, recipeId);
  const records = await queryAll(
    `SELECT recipe_id AS recipeId,recipe_version AS version,content_hash AS contentHash,transaction_hash AS transactionHash,
            contract_address AS contractAddress,network_name AS network,creator_wallet AS creatorWallet,status,confirmed_at AS confirmedAt,
            created_at AS createdAt,payload,event_type AS eventType
       FROM blockchain_records WHERE recipe_id=? AND recipe_version IS NOT NULL ORDER BY recipe_version DESC`,
    [recipeId]
  );
  if (!recipe) {
    const wallet = auth?.id ? await getLinkedWallet(auth.id) : null;
    const ownsHistory = records.some((row) => wallet?.address?.toLowerCase() === row.creatorWallet?.toLowerCase());
    if (!ownsHistory && !['admin', 'security_admin'].includes(auth?.role)) throw notFound('Recipe not found.', 'RECIPE_NOT_FOUND');
  }
  return { recipeId: Number(recipeId), deletedRecipe: !recipe, currentContentHash: recipe ? sha256Recipe(recipe) : null,
    records: records.map((row) => ({ ...row, payload: row.payload ? JSON.parse(row.payload) : null })) };
}

export async function verifyCurrentRecipe(auth, recipeId) {
  const recipe = await assertReadableRecipe(auth, recipeId);
  const { provider, contract, address } = await getRegistry();
  try {
    const onChain = await currentContractRecipe(contract, recipeId);
    const currentContentHash = sha256Recipe(recipe);
    if (onChain.version === 0) return { recipeId: Number(recipeId), verified: false, reason: 'NOT_REGISTERED', currentContentHash, currentVersion: 0, network: 'sepolia', contractAddress: address };
    const proof = await getVersionProof(contract, recipeId, onChain.version);
    const matches = proof.exists && String(proof.contentHash).toLowerCase() === currentContentHash.toLowerCase();
    return {
      recipeId: Number(recipeId), verified: Boolean(matches), reason: matches ? 'HASH_MATCH' : 'CONTENT_CHANGED',
      currentContentHash, onChainHash: String(proof.contentHash), currentVersion: onChain.version,
      creatorWallet: onChain.creatorWallet, verifiedAt: new Date(Number(proof.registeredAt) * 1000).toISOString(),
      network: 'sepolia', contractAddress: address,
    };
  } finally { closeProvider(provider); }
}

export async function lookupBlockchainTransaction(auth, transactionHash) {
  if (!TX_HASH_PATTERN.test(transactionHash || '')) throw badRequest('Transaction hash must be a 32-byte Ethereum hash.', 'TRANSACTION_HASH_INVALID');
  const row = await queryOne(
    `SELECT br.recipe_id AS recipeId,br.recipe_version AS version,br.content_hash AS contentHash,
            br.transaction_hash AS transactionHash,br.creator_wallet AS creatorWallet,br.status,br.network_name AS network
       FROM blockchain_records br WHERE br.transaction_hash=?`,
    [transactionHash.toLowerCase()]
  );
  if (!row) throw notFound('Transaction is not recorded in RecipeHub.', 'TRANSACTION_NOT_FOUND');
  const recipe = await getCanonicalRecipe(row.recipeId);
  if (recipe) await assertReadableRecipe(auth, row.recipeId);
  else {
    const wallet = auth?.id ? await getLinkedWallet(auth.id) : null;
    if (wallet?.address?.toLowerCase() !== row.creatorWallet?.toLowerCase() && !['admin', 'security_admin'].includes(auth?.role)) {
      throw notFound('Transaction is not available.', 'TRANSACTION_NOT_FOUND');
    }
  }
  if (row.status !== 'confirmed') return row;
  const { provider, address } = await getRegistry();
  try {
    const receipt = await provider.getTransactionReceipt(transactionHash);
    return { ...row, contractAddress: address, blockNumber: receipt?.blockNumber ?? null, confirmed: Boolean(receipt && Number(receipt.status) === 1) };
  } finally { closeProvider(provider); }
}

export async function getBlockchainDashboard(auth) {
  const ownerId = ['admin', 'security_admin'].includes(auth.role) ? null : auth.id;
  const rows = await queryAll(
    `SELECT br.recipe_id AS recipeId,COALESCE(r.title,'Deleted recipe ' || br.recipe_id) AS recipeTitle,br.recipe_version AS version,br.content_hash AS contentHash,br.status,
            br.transaction_hash AS transactionHash,br.contract_address AS contractAddress,br.network_name AS network,br.created_at AS createdAt
       FROM blockchain_records br LEFT JOIN recipes r ON r.id=br.recipe_id
      WHERE br.recipe_version IS NOT NULL ${ownerId === null ? '' : 'AND (r.author_id=? OR (r.id IS NULL AND lower(br.creator_wallet)=lower((SELECT address FROM user_wallets WHERE user_id=?))))'} ORDER BY br.created_at DESC LIMIT 250`,
    ownerId === null ? [] : [ownerId, ownerId]
  );
  const latest = new Map();
  for (const row of rows) {
    const recipeId = Number(row.recipeId);
    if (!latest.has(recipeId) || Number(row.version) > Number(latest.get(recipeId).version)) latest.set(recipeId, row);
  }
  let verifiedRecipes = 0;
  let configured = Boolean(config.blockchain.rpcUrl && isAddress(config.blockchain.contractAddress));
  if (configured) {
    try {
      const { provider, contract } = await getRegistry();
      try {
        for (const [recipeId, row] of latest) {
          if (!rows.some((record) => Number(record.recipeId) === recipeId && record.status === 'confirmed')) continue;
          const recipe = await getCanonicalRecipe(recipeId);
          if (!recipe) continue;
          const chain = await currentContractRecipe(contract, recipeId);
          if (chain.version > 0 && await verifyVersionHash(contract, recipeId, chain.version, sha256Recipe(recipe))) verifiedRecipes += 1;
        }
      } finally { closeProvider(provider); }
    } catch { configured = false; }
  }
  return {
    network: 'sepolia', configured,
    registeredRecipes: new Set(rows.filter((row) => row.status === 'confirmed').map((row) => Number(row.recipeId))).size,
    pendingRegistrations: rows.filter((row) => row.status === 'pending').length,
    failedRegistrations: rows.filter((row) => row.status === 'failed').length,
    verifiedRecipes,
    recent: rows.slice(0, 25),
  };
}

\# RecipeHub Blockchain Implementation Report

## Purpose

RecipeHub uses Ethereum Sepolia as a public integrity ledger for recipe versions. The recipe remains in Turso. Ethereum stores a SHA-256 digest, the numeric recipe ID, the submitting wallet, a version and a timestamp. This gives readers a way to check whether the current recipe content matches a historical proof without publishing the recipe or account details on-chain.

## Architecture and technology

- `blockchain/contracts/RecipeRegistry.sol` is a Solidity 0.8.24-compatible contract. It accepts the first version from the transaction sender and allows only that creator wallet to append a distinct content hash as a new version. It exposes recipe/version reads and hash verification, and emits `RecipeRegistered` and `RecipeVersionUpdated` events.
- `blockchain/scripts/compile-contract.mjs` compiles the contract using the installed `solc` package and writes `blockchain/artifacts/RecipeRegistry.json`. The checked-in compile result was generated with solc 0.8.36; Remix can compile the source with a stable 0.8.x compiler, preferably 0.8.24 or later.
- The React client uses ethers.js v6 and MetaMask. MetaMask signs wallet ownership challenges and sends contract transactions from the user's wallet. No signing key or recovery phrase is requested or held by RecipeHub.
- The Express service uses ethers.js v6 with a read-only JSON-RPC provider to prepare registrations, inspect contract state and independently verify the receipt, sender, event, version and stored hash before marking a record confirmed.
- Turso stores application recipes and transaction references/status. The existing `blockchain_records` table is extended in place with nullable Ethereum fields and unique indexes; legacy rows are preserved. `user_wallets` and expiring one-use `wallet_challenges` link a wallet to an authenticated RecipeHub account.

## Canonical recipe digest

`backend/src/blockchain/canonicalRecipeContent.js` selects title, description, category slug, image URL, cooking time, difficulty, servings, dietary information, ingredients and instructions. It normalises Unicode and whitespace, normalises common ingredient unit names, fixes object field order and serialises deterministic JSON. SHA-256 from Node's built-in `node:crypto` hashes that JSON. Database IDs, ratings, timestamps, authors and temporary UI state are excluded. Thus the digest represents recipe content and does not disclose the content itself.

## Registration and version tracking

1. An authenticated recipe owner creates or updates a recipe in Turso. The frontend then offers registration for a published recipe.
2. The user connects MetaMask on Sepolia. A short-lived server challenge is signed and verified before the wallet can be linked to the RecipeHub account.
3. The backend checks recipe ownership and publication state, calculates the canonical digest, inspects the registry, and writes a pending registration record.
4. The frontend calls the appropriate contract method through the linked MetaMask signer. It records the returned transaction hash as pending.
5. After a mined transaction, the backend checks receipt status, target contract, sender, matching event, version and on-chain digest. Only then does it mark the Turso record confirmed.
6. Recipe edits change the digest. The owner submits an append-only contract version; previous hashes remain readable. Failed or unconfirmed attempts remain `failed` or `pending` and are not represented as confirmed.

The blockchain API is mounted under `/api/blockchain`:

| Endpoint | Purpose |
| --- | --- |
| `GET /wallet` | Read the authenticated user's linked wallet |
| `POST /wallet/challenge` | Issue a short-lived wallet ownership challenge |
| `POST /wallet/verify` | Verify the signature and link the wallet |
| `POST /register/:id` | Prepare a pending recipe version |
| `POST /submitted/:id` | Record a MetaMask transaction hash as pending |
| `POST /confirm/:id` | Verify the mined transaction and mark it confirmed |
| `POST /failure/:id` | Mark a failed/rejected attempt |
| `GET /verify/:id` | Compare current recipe content with the latest on-chain version |
| `GET /history/:id` | Return retained version history |
| `GET /transaction/:txHash` | Look up a recorded transaction |
| `GET /dashboard` | Return counts and recent records scoped to owner or admin |

Authenticated write endpoints use existing permission middleware and recipe ownership checks. Public recipe proof reads use the existing recipe visibility rules. Administrative dashboard access is scoped to the existing admin roles.

## Configuration and local setup

Copy `backend/.env.example` to `backend/.env` and retain the existing Turso and authentication configuration. Set:

```dotenv
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_RPC_URL=<Sepolia RPC URL from a provider account>
BLOCKCHAIN_CONTRACT_ADDRESS=<address returned by your Remix deployment>
BLOCKCHAIN_CHAIN_ID=11155111
```

Use an RPC URL obtained from the chosen provider; this project does not supply or invent one. Compile `RecipeRegistry.sol` in Remix with Solidity 0.8.24 or later, select Injected Provider - MetaMask on Sepolia, deploy, and copy the resulting contract address into the backend environment. Fund the user's MetaMask account with Sepolia test ETH from a faucet. Configure MetaMask to Sepolia. Start the backend and frontend locally. Run `npm run init-db` from `backend` to apply additive schema changes; the migration does not delete recipes or blockchain records.

Never put a private key in frontend or backend configuration. The backend RPC is used for public reads only; transactions are user-signed in MetaMask.

## Dashboard and recipe details

The Profile > Blockchain verification view shows registered recipes, current verifications, pending versions, failed versions and recent transaction references. A recipe details page shows its latest proof status, version, creator wallet, date, history and Sepolia Etherscan links. A recipe mismatch is reported as changed/unverified. A pending transaction is never described as verified.

## Security and limitations

Only a recipe owner can prepare or submit that recipe's proof. Wallet links require a signed, expiring, single-use challenge. The contract derives the creator from `msg.sender`, rejects caller-supplied creator identities, and permits version updates only from the original wallet. On-chain data contains no recipe text or user profile information. Transaction confirmation is checked independently by the backend against the configured contract.

Sepolia is a test network and does not provide production guarantees. Users need MetaMask, Sepolia test ETH and network access. A wallet that loses access cannot append versions to recipes it created. Public-chain transactions are permanent and expose recipe IDs, hashes, wallet addresses and times. Hashes prove equality to recorded content, not authorship of the underlying recipe or its factual quality. RPC availability and provider limits can delay reads. The app has not been deployed online.

## Deployment state

No contract address or transaction reference is supplied by this implementation. The operator must deploy through Remix using their own MetaMask account and configure an RPC URL and deployed address. Until then, the live blockchain service reports unavailable and registration cannot be confirmed. No Sepolia deployment or transaction is claimed.

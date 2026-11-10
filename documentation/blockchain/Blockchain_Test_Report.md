# RecipeHub Blockchain Test Report

Date: 2026-11-07

## Results run in this workspace

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Solidity compilation | PASS | `npm run blockchain:compile` completed with solc 0.8.36 and produced `blockchain/artifacts/RecipeRegistry.json`. |
| SHA-256 deterministic output | PASS | Existing `npm run blockchain:test` subtest confirms 32-byte output and deterministic repeated hashing. |
| Canonical normalisation | PASS | Existing subtest covers whitespace, dietary tag order and ingredient unit aliases. |
| Important content changes alter digest | PASS | Existing subtest changes recipe content and checks the digest changes. |
| Unrelated IDs/UI fields excluded | PASS | Existing subtest checks database IDs and UI-only fields do not affect the digest. |
| Frontend production build | PASS | `npx vite build --configLoader runner` completed successfully (194 modules). The default config loader hit a sandbox access-denied error while esbuild traversed outside the workspace. |
| Backend end-to-end API suite | NOT COMPLETED | `npm test` was attempted but the suite requires a running backend and the initial request to `localhost:5000` failed. It also creates throwaway records in the configured database, so it was not launched against the configured remote Turso service. |
| Remix Sepolia deployment | NOT RUN | Requires operator MetaMask, Sepolia test ETH and a chosen RPC provider. No address is configured here. |
| Wallet connection / chain detection | NOT RUN | Requires MetaMask browser session and Sepolia selected. |
| Registration, confirmation, Etherscan lookup, verification and version history | NOT RUN | Requires a real deployment and user-signed Sepolia transactions. No transaction hashes are claimed. |
| Unauthorized/duplicate/failed chain transactions | NOT RUN | Requires a deployed contract and live wallet transactions. Contract code restricts version changes to the first creator wallet and rejects duplicate hashes. |

## Manual capture and test instructions

Capture screenshots in Remix/MetaMask/the local RecipeHub app after deployment. Do not include seed phrases, private keys, RPC credentials or other secrets in screenshots.

1. **Compiled contract:** Open `blockchain/contracts/RecipeRegistry.sol` in Remix, select Solidity 0.8.24 or later, compile, and capture the green compile result with the contract name visible.
2. **Deployed contract:** Select Injected Provider - MetaMask, confirm Sepolia (chain ID 11155111), deploy `RecipeRegistry`, and capture the deployed instance and address. Add this address to `BLOCKCHAIN_CONTRACT_ADDRESS` in the local backend environment.
3. **MetaMask connection:** Open a published recipe, choose Connect MetaMask, approve the account connection and message signature, and capture the account address/network display. Never capture seed or private-key screens.
4. **Successful registration:** Use the recipe owner's linked wallet and select Register this version on Sepolia. Approve the transaction and wait for one confirmation. Capture the RecipeHub confirmed state and transaction hash.
5. **Etherscan:** Open `https://sepolia.etherscan.io/tx/<transaction-hash>` and capture the successful transaction and deployed contract destination.
6. **Verification:** On the same recipe, select Verify recipe hash and capture the matching proof status. Change an important field and verify again; the expected response is `CONTENT_CHANGED` until a new version is registered.
7. **Version history:** Register the edited content with the creator wallet and capture the two versions and their transaction links. Confirm that the previous record remains visible.
8. **Negative checks:** Try linking another account's wallet, registering a recipe owned by another RecipeHub account, submitting a duplicate version, and confirming a failed/unmined transaction. Capture the rejection/pending states without claiming success.

## Summary

Local contract compilation and all four existing hash-specific checks passed. Live-chain, wallet and transaction results remain unverified because no Sepolia RPC or contract address is configured and no MetaMask transaction was performed. The implementation deliberately leaves blockchain writes pending or unavailable in that situation rather than claiming a successful registration.

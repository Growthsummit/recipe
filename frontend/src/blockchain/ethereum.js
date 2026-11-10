import { BrowserProvider, Contract, getAddress } from 'ethers';
import { api } from '../services/api';

export const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = '0xaa36a7';

// Write functions of the RecipeRegistry deployed on Sepolia (0x5a9c...fdba7b).
const REGISTRY_ABI = [
  'function registerRecipe(uint256 recipeId, bytes32 recipeHash, bytes32 creatorRef)',
  'function updateRecipe(uint256 recipeId, bytes32 newHash)',
];
const ALLOWED_METHODS = ['registerRecipe', 'updateRecipe'];

// Finds the injected wallet. Prefers Trust Wallet, falls back to any EIP-1193 provider (window.ethereum).
// If MetaMask and Trust Wallet are both enabled in Chrome they can fight over window.ethereum;
// disable one of them while testing.
function injectedProvider() {
  const trust = window.trustwallet?.ethereum ?? window.trustwallet;
  if (trust && typeof trust.request === 'function') return trust;
  const list = window.ethereum?.providers;
  if (Array.isArray(list)) {
    const found = list.find((p) => p.isTrust || p.isTrustWallet);
    if (found) return found;
  }
  return window.ethereum || null;
}

function walletProvider() {
  const injected = injectedProvider();
  if (!injected) throw new Error('No wallet was detected. Install and unlock the Trust Wallet browser extension.');
  return new BrowserProvider(injected);
}

async function ensureSepolia(provider, requestAccounts = true) {
  if (requestAccounts) await provider.send('eth_requestAccounts', []);
  let network = await provider.getNetwork();
  if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
    try {
      await injectedProvider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_HEX }] });
      network = await provider.getNetwork();
    } catch (error) {
      if (error?.code === 4001) throw error; // user rejected the switch
      // Some wallets (including Trust Wallet's extension) cannot switch networks programmatically.
    }
  }
  if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
    throw new Error('Switch your wallet to the Ethereum Sepolia network manually, then try again.');
  }
  return network;
}

async function connectAndLink(provider) {
  await ensureSepolia(provider);
  const signer = await provider.getSigner();
  const address = getAddress(await signer.getAddress());
  const linked = await api.blockchain.wallet();
  if (linked?.wallet?.address?.toLowerCase() === address.toLowerCase()) return { signer, address };
  const { challenge } = await api.blockchain.walletChallenge(address);
  const signature = await signer.signMessage(challenge.message);
  await api.blockchain.verifyWallet({
    address,
    nonce: challenge.message.match(/Nonce: ([0-9a-f]{64})/i)?.[1],
    message: challenge.message,
    signature,
  });
  return { signer, address };
}

// Export names are unchanged so existing components keep working; they now work with any injected wallet.
export async function getMetaMaskStatus() {
  if (!injectedProvider()) return { installed: false, address: null, chainId: null };
  try {
    const provider = walletProvider();
    const [network, accounts] = await Promise.all([provider.getNetwork(), provider.send('eth_accounts', [])]);
    return { installed: true, address: accounts[0] ? getAddress(accounts[0]) : null, chainId: Number(network.chainId) };
  } catch { return { installed: true, address: null, chainId: null }; }
}

export async function connectMetaMaskWallet() {
  const provider = walletProvider();
  const linked = await connectAndLink(provider);
  return { address: linked.address, chainId: SEPOLIA_CHAIN_ID };
}

export async function registerRecipeOnSepolia(recipeId, onStatus = () => {}) {
  let prepared = null;
  let transaction = null;
  try {
    const provider = walletProvider();
    const { signer, address } = await connectAndLink(provider);
    prepared = (await api.blockchain.prepare(recipeId)).registration;
    if (prepared.alreadyRegistered) return { status: 'confirmed', version: prepared.version, isCurrentContent: true, alreadyRegistered: true };
    if (getAddress(prepared.walletAddress) !== address) throw new Error('The linked RecipeHub wallet differs from the active wallet account.');
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== Number(prepared.chainId)) throw new Error('Your wallet is connected to a different network. Switch to Sepolia and retry.');
    if (!ALLOWED_METHODS.includes(prepared.method) || !Array.isArray(prepared.args)) {
      throw new Error('The server returned an unsupported blockchain request.');
    }
    const contract = new Contract(prepared.contractAddress, REGISTRY_ABI, signer);
    onStatus({ state: 'awaiting-signature', version: prepared.version });
    // The server decides the call: registerRecipe(id, hash, creatorRef) or updateRecipe(id, hash).
    const [idArg, ...restArgs] = prepared.args;
    transaction = await contract[prepared.method](BigInt(idArg), ...restArgs);
    await api.blockchain.submitted(recipeId, {
      version: prepared.version,
      contentHash: prepared.contentHash,
      transactionHash: transaction.hash,
    });
    onStatus({ state: 'confirming', version: prepared.version, transactionHash: transaction.hash });
    const receipt = await transaction.wait(1);
    if (!receipt || Number(receipt.status) !== 1) throw new Error('The Sepolia transaction failed or is not confirmed.');
    const { registration } = await api.blockchain.confirm(recipeId, {
      version: prepared.version,
      contentHash: prepared.contentHash,
      transactionHash: transaction.hash,
    });
    return registration;
  } catch (error) {
    if (prepared && !transaction?.hash) {
      await api.blockchain.failed(recipeId, { version: prepared.version, message: error.message }).catch(() => {});
    } else if (prepared && transaction?.hash) {
      await api.blockchain.submitted(recipeId, {
        version: prepared.version,
        contentHash: prepared.contentHash,
        transactionHash: transaction.hash,
      }).catch(() => {});
      if (error.receipt && Number(error.receipt.status) === 0) {
        await api.blockchain.failed(recipeId, { version: prepared.version, message: 'The Sepolia transaction reverted.' }).catch(() => {});
      }
      // If a broadcast transaction has not reached a terminal state, retain
      // Pending and let the user reconcile it later.
      error.transactionHash = transaction.hash;
    }
    throw error;
  }
}

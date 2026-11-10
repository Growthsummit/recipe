// RecipeHub blockchain service (ethers v6, ES module)
// Install: npm install ethers dotenv
import { ethers } from "ethers";
import crypto from "crypto";

// Human-readable ABI for RecipeRegistry (Sepolia)
const ABI = [
  "function registerRecipe(uint256 recipeId, bytes32 recipeHash, bytes32 creatorRef)",
  "function updateRecipe(uint256 recipeId, bytes32 newHash)",
  "function verifyRecipe(uint256 recipeId, bytes32 hashToCheck) view returns (bool matchesLatest, uint256 latestVersion)",
  "function getRecipe(uint256 recipeId) view returns (address creator, bytes32 creatorRef, bytes32 latestHash, uint256 latestTimestamp, uint256 latestVersion)",
  "function getRecipeHistory(uint256 recipeId) view returns (tuple(bytes32 recipeHash, uint256 timestamp, uint256 version)[])",
  "event RecipeRegistered(uint256 indexed recipeId, address indexed creator, bytes32 recipeHash, uint256 version, uint256 timestamp)",
  "event RecipeUpdated(uint256 indexed recipeId, address indexed creator, bytes32 newHash, uint256 version, uint256 timestamp)",
];

// Only these fields are hashed. Adjust to match your Turso recipes columns.
// Never include timestamps, view counts, ratings or anything that changes without a content edit.
const HASHED_FIELDS = ["title", "description", "ingredients", "instructions", "category", "cooking_time", "difficulty"];

const EXPLORER = "https://sepolia.etherscan.io";

let _contract = null;
function getContract() {
  if (_contract) return _contract;
  const { ETHEREUM_RPC_URL, CONTRACT_ADDRESS, BLOCKCHAIN_PRIVATE_KEY } = process.env;
  if (!ETHEREUM_RPC_URL || !CONTRACT_ADDRESS || !BLOCKCHAIN_PRIVATE_KEY) {
    throw new Error("Missing ETHEREUM_RPC_URL, CONTRACT_ADDRESS or BLOCKCHAIN_PRIVATE_KEY in .env");
  }
  const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
  const wallet = new ethers.Wallet(BLOCKCHAIN_PRIVATE_KEY, provider);
  _contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
  return _contract;
}

// Stable JSON: sorted keys so the same content always gives the same hash
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = canonicalize(value[k]);
      return acc;
    }, {});
  }
  if (typeof value === "string") return value.trim();
  return value ?? null;
}

function hashRecipe(recipe) {
  const content = {};
  for (const f of HASHED_FIELDS) content[f] = recipe[f] ?? null;
  const json = JSON.stringify(canonicalize(content));
  return "0x" + crypto.createHash("sha256").update(json).digest("hex");
}

// Pseudonymous creator reference: no personal data goes on-chain
function hashUserRef(userId) {
  const salt = process.env.USER_REF_SALT || "recipehub-dev-salt";
  return "0x" + crypto.createHmac("sha256", salt).update(String(userId)).digest("hex");
}

function receiptInfo(tx, receipt) {
  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status === 1 ? "confirmed" : "failed",
    explorerUrl: `${EXPLORER}/tx/${tx.hash}`,
  };
}

async function registerRecipe(recipeId, recipe, userId) {
  const contract = getContract();
  const recipeHash = hashRecipe(recipe);
  const tx = await contract.registerRecipe(recipeId, recipeHash, hashUserRef(userId));
  const receipt = await tx.wait();
  return { recipeHash, version: 1, ...receiptInfo(tx, receipt) };
}

async function updateRecipe(recipeId, recipe) {
  const contract = getContract();
  const recipeHash = hashRecipe(recipe);
  const tx = await contract.updateRecipe(recipeId, recipeHash);
  const receipt = await tx.wait();
  const [, version] = await contract.verifyRecipe(recipeId, recipeHash);
  return { recipeHash, version: Number(version), ...receiptInfo(tx, receipt) };
}

async function verifyRecipe(recipeId, recipe) {
  const contract = getContract();
  const localHash = hashRecipe(recipe);
  try {
    const [matches, version] = await contract.verifyRecipe(recipeId, localHash);
    const rec = await contract.getRecipe(recipeId);
    return {
      registered: true,
      verified: matches,
      localHash,
      onChainHash: rec.latestHash,
      version: Number(version),
      timestamp: Number(rec.latestTimestamp),
      creatorWallet: rec.creator,
    };
  } catch (err) {
    if (String(err.reason || err.message).includes("Recipe not found")) {
      return { registered: false, verified: false, localHash };
    }
    throw err;
  }
}

async function getRecipeHistory(recipeId) {
  const history = await getContract().getRecipeHistory(recipeId);
  return history.map((v) => ({
    recipeHash: v.recipeHash,
    timestamp: Number(v.timestamp),
    version: Number(v.version),
  }));
}

export { hashRecipe, hashUserRef, registerRecipe, updateRecipe, verifyRecipe, getRecipeHistory };

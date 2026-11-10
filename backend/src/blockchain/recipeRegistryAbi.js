// ABI of the RecipeRegistry contract deployed on Sepolia at
// 0x5a9c7611bb0547134eb444a8c8bd4ad667fdba7b (deployed from Remix).
export const RECIPE_REGISTRY_ABI = [
  'function registerRecipe(uint256 recipeId, bytes32 recipeHash, bytes32 creatorRef)',
  'function updateRecipe(uint256 recipeId, bytes32 newHash)',
  'function verifyRecipe(uint256 recipeId, bytes32 hashToCheck) view returns (bool matchesLatest, uint256 latestVersion)',
  'function getRecipe(uint256 recipeId) view returns (address creator, bytes32 creatorRef, bytes32 latestHash, uint256 latestTimestamp, uint256 latestVersion)',
  'function getRecipeHistory(uint256 recipeId) view returns (tuple(bytes32 recipeHash, uint256 timestamp, uint256 version)[])',
  'event RecipeRegistered(uint256 indexed recipeId, address indexed creator, bytes32 recipeHash, uint256 version, uint256 timestamp)',
  'event RecipeUpdated(uint256 indexed recipeId, address indexed creator, bytes32 newHash, uint256 version, uint256 timestamp)',
];

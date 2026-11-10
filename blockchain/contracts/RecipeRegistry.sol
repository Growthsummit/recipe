// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RecipeRegistry
/// @notice Stores a recipe ID and SHA-256 integrity proof, never recipe text or personal data.
contract RecipeRegistry {
    struct VersionRecord {
        bytes32 contentHash;
        uint64 registeredAt;
        bool exists;
    }

    struct RecipeRecord {
        address creatorWallet;
        uint32 currentVersion;
    }

    mapping(uint256 recipeId => RecipeRecord) private recipes;
    mapping(uint256 recipeId => mapping(uint32 version => VersionRecord)) private versions;

    error InvalidRecipeId();
    error InvalidContentHash();
    error RecipeAlreadyRegistered(uint256 recipeId);
    error RecipeNotRegistered(uint256 recipeId);
    error NotRecipeCreator(uint256 recipeId, address caller);
    error DuplicateContentHash(uint256 recipeId);

    event RecipeRegistered(
        uint256 indexed recipeId,
        uint32 indexed version,
        bytes32 contentHash,
        address indexed creatorWallet,
        uint64 timestamp
    );
    event RecipeVersionUpdated(
        uint256 indexed recipeId,
        uint32 indexed version,
        bytes32 contentHash,
        address indexed creatorWallet,
        uint64 timestamp
    );

    /// @notice The transaction sender becomes the record creator; no caller can nominate another wallet.
    function registerRecipe(uint256 recipeId, bytes32 contentHash) external {
        if (recipeId == 0) revert InvalidRecipeId();
        if (contentHash == bytes32(0)) revert InvalidContentHash();
        if (recipes[recipeId].creatorWallet != address(0)) revert RecipeAlreadyRegistered(recipeId);

        uint64 timestamp = uint64(block.timestamp);
        recipes[recipeId] = RecipeRecord({creatorWallet: msg.sender, currentVersion: 1});
        versions[recipeId][1] = VersionRecord({contentHash: contentHash, registeredAt: timestamp, exists: true});
        emit RecipeRegistered(recipeId, 1, contentHash, msg.sender, timestamp);
    }

    /// @notice Only the original wallet can append a new, non-duplicate version.
    function registerRecipeVersion(uint256 recipeId, bytes32 contentHash) external {
        RecipeRecord storage recipe = recipes[recipeId];
        if (recipe.creatorWallet == address(0)) revert RecipeNotRegistered(recipeId);
        if (recipe.creatorWallet != msg.sender) revert NotRecipeCreator(recipeId, msg.sender);
        if (contentHash == bytes32(0)) revert InvalidContentHash();
        if (versions[recipeId][recipe.currentVersion].contentHash == contentHash) revert DuplicateContentHash(recipeId);

        uint32 nextVersion = recipe.currentVersion + 1;
        uint64 timestamp = uint64(block.timestamp);
        recipe.currentVersion = nextVersion;
        versions[recipeId][nextVersion] = VersionRecord({contentHash: contentHash, registeredAt: timestamp, exists: true});
        emit RecipeVersionUpdated(recipeId, nextVersion, contentHash, msg.sender, timestamp);
    }

    /// @notice Returns creator and latest version without exposing recipe content.
    function getRecipe(uint256 recipeId) external view returns (address creatorWallet, uint32 currentVersion) {
        RecipeRecord memory recipe = recipes[recipeId];
        return (recipe.creatorWallet, recipe.currentVersion);
    }

    /// @notice Returns a single immutable version record.
    function getVersion(uint256 recipeId, uint32 version)
        external
        view
        returns (bytes32 contentHash, uint64 registeredAt, bool exists)
    {
        VersionRecord memory record = versions[recipeId][version];
        return (record.contentHash, record.registeredAt, record.exists);
    }

    /// @notice Verifies a supplied SHA-256 digest against the selected on-chain version.
    function verifyRecipe(uint256 recipeId, uint32 version, bytes32 expectedHash) external view returns (bool) {
        VersionRecord memory record = versions[recipeId][version];
        return record.exists && record.contentHash == expectedHash;
    }
}

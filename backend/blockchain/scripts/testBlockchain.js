// End-to-end test: register -> verify -> tamper -> verify -> update -> history
import "dotenv/config";
import * as bc from "../blockchain.js";

(async () => {
  const id = Math.floor(Date.now() / 1000); // unique id for each test run
  const recipe = {
    title: "Papa and Moroho",
    description: "Traditional Lesotho staple",
    ingredients: ["maize meal", "moroho", "onion"],
    instructions: "Boil, stir, serve.",
    category: "Main Course",
    cooking_time: 45,
    difficulty: "Easy",
  };

  console.log("1. Registering recipe", id);
  const reg = await bc.registerRecipe(id, recipe, 42);
  console.log("   ", reg.status, reg.txHash, "\n   ", reg.explorerUrl);

  console.log("2. Verify original  ->", (await bc.verifyRecipe(id, recipe)).verified);

  const tampered = { ...recipe, ingredients: [...recipe.ingredients, "secret ingredient"] };
  console.log("3. Verify tampered  ->", (await bc.verifyRecipe(id, tampered)).verified, "(should be false)");

  console.log("4. Updating to version 2");
  const upd = await bc.updateRecipe(id, tampered);
  console.log("   ", upd.status, "version", upd.version, upd.explorerUrl);

  console.log("5. History:", await bc.getRecipeHistory(id));
})().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); process.exit(1); });

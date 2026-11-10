// Creates a NEW wallet for the backend to sign transactions. Run once: node scripts/generateWallet.js
import { Wallet } from "ethers";
const w = Wallet.createRandom();
console.log("Address     :", w.address);
console.log("Private key :", w.privateKey);
console.log("\nPut the private key in backend/.env as BLOCKCHAIN_PRIVATE_KEY. Never commit it or paste it in chat.");

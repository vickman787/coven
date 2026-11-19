#!/usr/bin/env node
/**
 * Generate a fresh Coven testnet wallet.
 *
 * Testnet only. The money has no value. Never use this wallet on mainnet,
 * and never commit the private key. Save it in .env as
 * COVEN_PAYER_PRIVATE_KEY, and fund the address with test USDC at
 * https://faucet.circle.com (choose USDC, Base Sepolia, pass the captcha).
 *
 * Run: pnpm --filter @coven/payments generate-wallet
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Coven testnet wallet (Base Sepolia, test USDC only)");
console.log(`Address:           ${account.address}`);
console.log(`Private key:       ${privateKey}`);
console.log("");
console.log("Save this in ~/workspace/coven/.env (never commit it):");
console.log(`COVEN_PAYER_PRIVATE_KEY=${privateKey}`);
console.log(`COVEN_PAYEE_ADDRESS=${account.address}`);
console.log("");
console.log("Fund it with 20 test USDC (free, no account, captcha required):");
console.log("https://faucet.circle.com — USDC, Base Sepolia, paste the address above.");

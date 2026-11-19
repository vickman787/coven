/**
 * Coven payments — real x402 v2 on Base Sepolia (testnet).
 *
 * Step 1 stub is gone. This package now implements the real protocol:
 * PaymentRequirements, 402 responses, EIP-3009 signing with viem, and
 * facilitator verify/settle against https://x402.org/facilitator.
 * See ./x402.ts for the implementation and sources.
 *
 * A payment is only reported settled when the facilitator says it
 * settled and returns a transaction hash. Anything else is unresolved.
 * Test USDC (no value) comes from the Circle faucet:
 * https://faucet.circle.com — choose USDC, Base Sepolia, paste the
 * payer address, pass the captcha. The payer needs test USDC, not ETH:
 * the facilitator pays the gas.
 */
export * from "./x402.js";

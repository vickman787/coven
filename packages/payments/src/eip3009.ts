import type { Hex } from "viem";

/**
 * EIP-3009 transferWithAuthorization constants for Base Sepolia USDC.
 *
 * Browser-safe: this module imports only types from viem and no node
 * APIs, so both the server signer (x402.ts) and the browser signer
 * (user-wallet.ts, where the user's key lives) use exactly the same
 * domain, types, and message shape. If these ever diverge, a
 * user-signed authorization will not recover to the user's address
 * and the server will reject the job — by design.
 */

export const X402_VERSION = 2;
export const NETWORK = "eip155:84532"; // Base Sepolia
export const CHAIN_ID = 84532;
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

export const EIP3009_DOMAIN = {
  chainId: CHAIN_ID,
  name: "USDC",
  verifyingContract: USDC_BASE_SEPOLIA as Hex,
  version: "2",
} as const;

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface Eip3009Authorization {
  from: string;
  nonce: string;
  to: string;
  validAfter: string;
  validBefore: string;
  value: string;
}

export interface PaymentRequirements {
  amount: string;
  asset: string;
  extra: { assetTransferMethod: "eip3009"; name: "USDC"; version: "2" };
  maxTimeoutSeconds: number;
  network: string;
  payTo: string;
  scheme: "exact";
}

export interface PaymentPayload {
  accepted: PaymentRequirements;
  payload: { authorization: Eip3009Authorization; signature: string };
  x402Version: 2;
}

/** 1 USDC = 1,000,000 atomic units = 100 cents, so 1 cent = 10,000 units. */
export function centsToAtomicUnits(amountCents: number): bigint {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }
  return BigInt(amountCents) * 10_000n;
}

export function atomicUnitsToCents(units: bigint): number {
  return Number(units / 10_000n);
}

export function buildPaymentRequirements(input: {
  amountCents: number;
  payTo: string;
  maxTimeoutSeconds?: number;
}): PaymentRequirements {
  return {
    amount: centsToAtomicUnits(input.amountCents).toString(),
    asset: USDC_BASE_SEPOLIA,
    extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2" },
    maxTimeoutSeconds: input.maxTimeoutSeconds ?? 60,
    network: NETWORK,
    payTo: input.payTo,
    scheme: "exact",
  };
}

/** The typed-data message for an EIP-3009 authorization, for signing/recovery. */
export function authorizationMessage(auth: Eip3009Authorization) {
  return {
    from: auth.from as Hex,
    nonce: auth.nonce as Hex,
    to: auth.to as Hex,
    validAfter: BigInt(auth.validAfter),
    validBefore: BigInt(auth.validBefore),
    value: BigInt(auth.value),
  };
}

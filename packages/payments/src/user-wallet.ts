import type { Hex } from "viem";
import { allocateBudget } from "@coven/shared";
import {
  buildPaymentRequirements as buildRequirements,
  centsToAtomicUnits,
} from "./eip3009.js";
import {
  EIP3009_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  USDC_BASE_SEPOLIA,
} from "./eip3009.js";
import type { PaymentPayload } from "./eip3009.js";

/**
 * Per-user testnet wallets — BROWSER-SAFE, no private keys anywhere.
 *
 * Since 2026-11-20 the user connects their OWN wallet with Reown
 * AppKit (WalletConnect) and signs with it. This module holds NO
 * private key: there is no wallet generation, no key import, no
 * key storage, and no signing with a key held in code. The only
 * signing happens in the user's wallet app, via wagmi's
 * `signTypedData` (see apps/web/lib/walletconnect.ts), which asks
 * the connected wallet to sign each EIP-3009 authorization.
 *
 * What lives here instead:
 * - the pure typed-data requests for the 4 handoffs, so the browser
 *   and the tests build exactly the same message the server
 *   validates (same domain, types, amounts, self-payee, 10-minute
 *   window, distinct random nonces);
 * - assembling a signed payload from a signature the wallet
 *   returned;
 * - reading a wallet's onchain test USDC balance, and address
 *   helpers for display.
 *
 * Testnet Base Sepolia USDC only. The money has no real value.
 * Destination is the user's OWN address (self-transfer), the same
 * model as the shared demo wallet: the facilitator verifies the
 * signature and balance and settles a real onchain transaction,
 * but the test USDC is not spent.
 */

export const USDC_FAUCET_URL = "https://faucet.circle.com";
export const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
export const BASE_SEPOLIA_BLOCKSCOUT_ADDRESS = (address: string) =>
  `https://base-sepolia.blockscout.com/address/${address}`;

/** 1 cent = 10,000 USDC atomic units (6 decimals). */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export function shortAddress(address: string): string {
  return isValidAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

const BALANCE_OF_SELECTOR = "0x70a08231";

/**
 * Read a wallet's test USDC balance in integer cents, via a plain
 * eth_call to the public Base Sepolia RPC. Returns null when the
 * balance is unknown (RPC down / timeout) — callers must NOT treat
 * null as zero: the facilitator is the final authority at settle
 * time, and an unknown balance must not block a job by itself.
 */
export async function getUsdcBalanceCents(
  address: string,
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  if (!isValidAddress(address)) throw new Error("invalid address");
  const padded = address.slice(2).toLowerCase().padStart(64, "0");
  // One retry: a cold serverless fetch can be slow on the first call,
  // and a transient RPC failure must not silently turn into "unknown
  // balance" when the wallet is actually empty.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchFn(BASE_SEPOLIA_RPC_URL, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{ data: `${BALANCE_OF_SELECTOR}${padded}`, to: USDC_BASE_SEPOLIA }, "latest"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result?: string };
      if (!data.result || !/^0x[0-9a-fA-F]+$/.test(data.result)) return null;
      return Number(BigInt(data.result) / 10_000n);
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

/**
 * Balance gate for the Summon form. `null` (unknown balance) does
 * not block: the facilitator will reject an unfunded payment at
 * verify time and the ledger will show it unresolved.
 */
export function balanceCoversBudget(
  balanceCents: number | null,
  budgetCents: number,
): boolean {
  if (balanceCents === null) return true;
  return balanceCents >= budgetCents;
}

function randomNonceHex(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export interface HandoffSigningRequest {
  /** Amount for this handoff, in integer cents. */
  amountCents: number;
  domain: typeof EIP3009_DOMAIN;
  message: {
    from: Hex;
    nonce: Hex;
    to: Hex;
    validAfter: bigint;
    validBefore: bigint;
    value: bigint;
  };
  primaryType: "TransferWithAuthorization";
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
}

/**
 * Build the 4 typed-data signing requests for a user-funded job —
 * one per handoff, in allocation order (seeker, weaver, keeper,
 * warden), paying the user's own address. Pure: no key, no signing.
 * The connected wallet signs each request (wagmi `signTypedData`);
 * the signatures go to {@link handoffPayloadFromSignature}.
 */
export function buildHandoffSigningRequests(input: {
  budgetCents: number;
  payerAddress: string;
  validForSeconds?: number;
}): HandoffSigningRequest[] {
  if (!isValidAddress(input.payerAddress)) {
    throw new Error("payerAddress must be a valid wallet address");
  }
  const payer = input.payerAddress as Hex;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validBefore = now + (input.validForSeconds ?? 600);
  return allocateBudget(input.budgetCents).map(({ amountCents }) => ({
    amountCents,
    domain: EIP3009_DOMAIN,
    message: {
      from: payer,
      nonce: randomNonceHex(),
      to: payer,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      value: centsToAtomicUnits(amountCents),
    },
    primaryType: "TransferWithAuthorization" as const,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
  }));
}

/**
 * Assemble one x402 payment payload from a signing request and the
 * signature the connected wallet returned for it. The signature is
 * the only wallet output; the key never leaves the wallet app.
 */
export function handoffPayloadFromSignature(
  request: HandoffSigningRequest,
  signature: Hex,
): PaymentPayload {
  const { amountCents, message } = request;
  return {
    accepted: buildRequirements({ amountCents, payTo: message.to }),
    payload: {
      authorization: {
        from: message.from,
        nonce: message.nonce,
        to: message.to,
        validAfter: message.validAfter.toString(),
        validBefore: message.validBefore.toString(),
        value: message.value.toString(),
      },
      signature,
    },
    x402Version: 2,
  };
}

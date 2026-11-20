import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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
 * Per-user testnet wallets — BROWSER-SAFE.
 *
 * This module must never import node APIs (no node:crypto, no
 * "x402.ts" server code): it runs in the user's browser, where the
 * private key lives. It imports only viem/accounts, @coven/shared,
 * and the shared EIP-3009 constants. The web app imports it via the
 * "@coven/payments/user-wallet" subpath so the server-only x402
 * module (and its node:crypto import) is never bundled into the page.
 *
 * Security model, in plain terms:
 * - The key is generated in the browser and stored ONLY in this
 *   browser's localStorage (see apps/web/lib/user-wallet.ts). It is
 *   never sent to the server, never stored in Postgres, never logged.
 * - The browser signs one EIP-3009 authorization per handoff and
 *   sends only those signed payloads. Each is bound to one amount,
 *   one payer, one payee, one nonce, and a 10-minute window.
 * - Testnet Base Sepolia USDC only. The money has no real value.
 *   Anyone with the key controls the wallet, so the UI must say so
 *   and offer export/backup and removal.
 * - Destination is the user's OWN address (self-transfer), the same
 *   model as the shared demo wallet: the facilitator verifies the
 *   signature and balance and settles a real onchain transaction,
 *   but the test USDC is not spent. Paying a Coven payee would be a
 *   real charge and is NOT what this version does.
 */

export const USDC_FAUCET_URL = "https://faucet.circle.com";
export const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
export const BASE_SEPOLIA_BLOCKSCOUT_ADDRESS = (address: string) =>
  `https://base-sepolia.blockscout.com/address/${address}`;

/** 1 cent = 10,000 USDC atomic units (6 decimals). */
export function generateUserWallet(): { address: string; privateKey: Hex } {
  const privateKey = generatePrivateKey();
  return { address: privateKeyToAccount(privateKey).address, privateKey };
}

export function addressFromPrivateKey(privateKey: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("private key must be 0x followed by 64 hex characters");
  }
  return privateKeyToAccount(privateKey as Hex).address;
}

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

/**
 * Sign one EIP-3009 authorization per handoff, in allocation order
 * (seeker, weaver, keeper, warden), paying the user's own address.
 * The private key is used only here, in the browser, and is never
 * returned in the result — only the signed payloads leave the page.
 */
export async function signUserHandoffAuthorizations(input: {
  budgetCents: number;
  privateKey: Hex;
  validForSeconds?: number;
}): Promise<{ authorizations: PaymentPayload[]; payerAddress: string }> {
  const account = privateKeyToAccount(input.privateKey);
  const payerAddress = account.address;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validBefore = now + (input.validForSeconds ?? 600);
  const authorizations: PaymentPayload[] = [];
  for (const { amountCents } of allocateBudget(input.budgetCents)) {
    const value = centsToAtomicUnits(amountCents);
    const nonce = randomNonceHex();
    const signature = await account.signTypedData({
      domain: EIP3009_DOMAIN,
      message: {
        from: payerAddress,
        nonce,
        to: payerAddress,
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        value,
      },
      primaryType: "TransferWithAuthorization",
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    });
    authorizations.push({
      accepted: buildRequirements({ amountCents, payTo: payerAddress }),
      payload: {
        authorization: {
          from: payerAddress,
          nonce,
          to: payerAddress,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          value: value.toString(),
        },
        signature,
      },
      x402Version: 2,
    });
  }
  return { authorizations, payerAddress };
}

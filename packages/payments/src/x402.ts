import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import type { Hex } from "viem";
import { allocateBudget } from "@coven/shared";
import {
  atomicUnitsToCents,
  authorizationMessage,
  buildPaymentRequirements,
  centsToAtomicUnits,
  EIP3009_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./eip3009.js";
import type {
  Eip3009Authorization,
  PaymentPayload,
  PaymentRequirements,
} from "./eip3009.js";

export {
  atomicUnitsToCents,
  authorizationMessage,
  buildPaymentRequirements,
  centsToAtomicUnits,
  CHAIN_ID,
  EIP3009_DOMAIN,
  NETWORK,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  USDC_BASE_SEPOLIA,
  USDC_DECIMALS,
  X402_VERSION,
} from "./eip3009.js";
export type {
  Eip3009Authorization,
  PaymentPayload,
  PaymentRequirements,
} from "./eip3009.js";

/**
 * Real x402 v2 payments on Base Sepolia (testnet), exact scheme, EIP-3009.
 *
 * Sources (checked 2026-11-19):
 * - x402 v2 spec: https://raw.githubusercontent.com/x402-foundation/x402/main/specs/x402-specification-v2.md
 * - exact/EVM scheme: https://raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/exact/scheme_exact_evm.md
 * - Live facilitator: https://x402.org/facilitator (GET /supported confirms
 *   exact on eip155:84532)
 *
 * Flow: server builds PaymentRequirements -> client signs an EIP-3009
 * transferWithAuthorization (USDC, name "USDC", version "2") -> facilitator
 * POST /verify -> facilitator POST /settle -> transaction hash.
 * The facilitator pays the gas; the payer only signs. The payer needs
 * test USDC, not test ETH.
 *
 * Agent wallets are logical in the demo: onchain, the Coven payer wallet
 * (COVEN_PAYER_PRIVATE_KEY, testnet only) pays the Coven payee wallet
 * (COVEN_PAYEE_ADDRESS) once per agent handoff. The ledger records which
 * agents the money moved between; the x402 hash is real and distinct
 * per handoff. Per-agent onchain wallets are a later step.
 */

export type { Hex } from "viem";

export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

export interface PaymentRequired {
  accepts: PaymentRequirements[];
  error?: string;
  extensions: Record<string, never>;
  resource: { description: string; mimeType: string; url: string };
  x402Version: 2;
}

export function buildPaymentRequired(input: {
  amountCents: number;
  description: string;
  payTo: string;
  url: string;
}): PaymentRequired {
  return {
    accepts: [buildPaymentRequirements(input)],
    error: "PAYMENT-SIGNATURE header is required",
    extensions: {},
    resource: {
      description: input.description,
      mimeType: "application/json",
      url: input.url,
    },
    x402Version: 2,
  };
}

/** Base64-encode the PaymentRequired object for the PAYMENT-REQUIRED header. */
export function encodePaymentRequired(required: PaymentRequired): string {
  return Buffer.from(JSON.stringify(required), "utf-8").toString("base64");
}

export function decodePaymentRequired(header: string): PaymentRequired {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as PaymentRequired;
}

/** Sign an EIP-3009 transferWithAuthorization with a testnet private key. */
export async function signPaymentAuthorization(input: {
  amountCents: number;
  payTo: string;
  privateKey: Hex;
  validForSeconds?: number;
}): Promise<PaymentPayload> {
  const account = privateKeyToAccount(input.privateKey);
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validBefore = now + (input.validForSeconds ?? 60);
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const value = centsToAtomicUnits(input.amountCents);
  const requirements = buildPaymentRequirements({
    amountCents: input.amountCents,
    payTo: input.payTo,
  });
  const signature = await account.signTypedData({
    domain: EIP3009_DOMAIN,
    message: {
      from: account.address,
      nonce,
      to: input.payTo as Hex,
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      value,
    },
    primaryType: "TransferWithAuthorization",
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
  });
  return {
    accepted: requirements,
    payload: {
      authorization: {
        from: account.address,
        nonce,
        to: input.payTo,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        value: value.toString(),
      },
      signature,
    },
    x402Version: 2,
  };
}

/** Recover the signer of a signed EIP-3009 authorization (local check). */
export async function recoverAuthorizationSigner(
  payload: PaymentPayload,
): Promise<string> {
  const auth = payload.payload.authorization;
  return recoverTypedDataAddress({
    domain: EIP3009_DOMAIN,
    message: authorizationMessage(auth),
    primaryType: "TransferWithAuthorization",
    signature: payload.payload.signature as Hex,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
  });
}

export interface FacilitatorVerifyResult {
  invalidReason?: string;
  isValid: boolean;
  payer?: string;
}

export interface FacilitatorSettleResult {
  errorReason?: string;
  network?: string;
  payer?: string;
  success: boolean;
  transaction?: string;
}

export class FacilitatorClient {
  constructor(
    private facilitatorUrl: string = DEFAULT_FACILITATOR_URL,
    private fetchFn: typeof fetch = fetch,
    private timeoutMs: number = 30_000,
  ) {}

  async supported(): Promise<unknown> {
    const res = await this.fetchFn(`${this.facilitatorUrl}/supported`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`facilitator /supported failed: ${res.status}`);
    return res.json();
  }

  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<FacilitatorVerifyResult> {
    const res = await this.fetchFn(`${this.facilitatorUrl}/verify`, {
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
        x402Version: 2,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`facilitator /verify failed: ${res.status}`);
    return (await res.json()) as FacilitatorVerifyResult;
  }

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<FacilitatorSettleResult> {
    const res = await this.fetchFn(`${this.facilitatorUrl}/settle`, {
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
        x402Version: 2,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`facilitator /settle failed: ${res.status}`);
    return (await res.json()) as FacilitatorSettleResult;
  }
}

export type PaymentExecutionStatus = "settled" | "unresolved";

export interface PaymentExecutionResult {
  reason?: string;
  status: PaymentExecutionStatus;
  txHash?: string;
}

/**
 * Execute one agent-to-agent payment via x402.
 * Returns settled + txHash only when the facilitator actually settled it.
 * Any other outcome is unresolved, with the facilitator's reason, so the
 * ledger never records a payment as settled that did not settle.
 */
export class X402PaymentExecutor {
  private facilitator: FacilitatorClient;

  constructor(opts: {
    facilitator?: FacilitatorClient;
    facilitatorUrl?: string;
    payTo: string;
    payerPrivateKey: Hex;
  }) {
    this.facilitator =
      opts.facilitator ?? new FacilitatorClient(opts.facilitatorUrl);
    this.payTo = opts.payTo;
    this.payerPrivateKey = opts.payerPrivateKey;
  }

  private payTo: string;
  private payerPrivateKey: Hex;

  async pay(input: {
    amountCents: number;
    description: string;
  }): Promise<PaymentExecutionResult> {
    const requirements = buildPaymentRequirements({
      amountCents: input.amountCents,
      payTo: this.payTo,
    });
    const payload = await signPaymentAuthorization({
      amountCents: input.amountCents,
      payTo: this.payTo,
      privateKey: this.payerPrivateKey,
    });
    let verified: FacilitatorVerifyResult;
    try {
      verified = await this.facilitator.verify(payload, requirements);
    } catch (err) {
      return {
        reason: err instanceof Error ? err.message : "facilitator verify failed",
        status: "unresolved",
      };
    }
    if (!verified.isValid) {
      return {
        reason: verified.invalidReason ?? "facilitator verification failed",
        status: "unresolved",
      };
    }
    let settled: FacilitatorSettleResult;
    try {
      settled = await this.facilitator.settle(payload, requirements);
    } catch (err) {
      return {
        reason: err instanceof Error ? err.message : "facilitator settle failed",
        status: "unresolved",
      };
    }
    if (settled.success && settled.transaction) {
      return { status: "settled", txHash: settled.transaction };
    }
    // settlement_pending: the tx broadcast but confirmation is unknown.
    // Record it as unresolved with the hash, so it can be reconciled
    // onchain before retrying — never as settled.
    if (settled.transaction) {
      return {
        reason: settled.errorReason ?? "settlement_pending",
        status: "unresolved",
        txHash: settled.transaction,
      };
    }
    return {
      reason: settled.errorReason ?? "facilitator settlement failed",
      status: "unresolved",
    };
  }
}

export function payerAddress(privateKey: Hex): string {
  return privateKeyToAccount(privateKey).address;
}

/**
 * Per-user wallets (added 2026-11-20).
 *
 * The user's private key NEVER reaches the server. The browser signs
 * one EIP-3009 authorization per handoff (amounts = allocateBudget)
 * and sends only the signed payloads with the job. The server
 * validates them here before the job is created, then settles them
 * one by one with the facilitator. A signed authorization is
 * single-use, amount- and payer-bound, and time-limited, so a stolen
 * payload cannot drain the wallet — but it must still be treated as
 * sensitive: the server keeps payloads in memory only, never in
 * Postgres, logs, or git, and discards them after the job runs.
 *
 * Destination: in this demo the user pays THEMSELVES (payTo =
 * payerAddress), the same self-transfer model as the shared demo
 * wallet. The facilitator still verifies the signature and the
 * balance and settles a real onchain transaction, so the proof is
 * real — but the test USDC is not spent. Paying a Coven payee or
 * per-agent wallets is a later step, and would be a real charge.
 */

export async function validateUserAuthorizations(input: {
  authorizations: PaymentPayload[];
  budgetCents: number;
  payTo: string;
  payerAddress: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { authorizations, budgetCents, payTo, payerAddress } = input;
  const expected = allocateBudget(budgetCents);
  if (!Array.isArray(authorizations) || authorizations.length !== expected.length) {
    return { ok: false, reason: `expected ${expected.length} signed authorizations, got ${authorizations?.length ?? 0}` };
  }
  const now = Math.floor(Date.now() / 1000);
  const nonces = new Set<string>();
  for (let i = 0; i < authorizations.length; i++) {
    const payload = authorizations[i]!;
    const auth = payload?.payload?.authorization;
    if (!auth || !payload.payload?.signature || payload.x402Version !== 2) {
      return { ok: false, reason: `authorization ${i + 1} is malformed` };
    }
    if (auth.from.toLowerCase() !== payerAddress.toLowerCase()) {
      return { ok: false, reason: `authorization ${i + 1} is not from the claimed wallet` };
    }
    if (auth.to.toLowerCase() !== payTo.toLowerCase()) {
      return { ok: false, reason: `authorization ${i + 1} pays the wrong address` };
    }
    if (auth.value !== centsToAtomicUnits(expected[i]!.amountCents).toString()) {
      return { ok: false, reason: `authorization ${i + 1} is for the wrong amount` };
    }
    if (nonces.has(auth.nonce)) {
      return { ok: false, reason: `authorization ${i + 1} reuses a nonce` };
    }
    nonces.add(auth.nonce);
    const validAfter = Number(auth.validAfter);
    const validBefore = Number(auth.validBefore);
    if (!Number.isFinite(validAfter) || !Number.isFinite(validBefore)) {
      return { ok: false, reason: `authorization ${i + 1} has an invalid validity window` };
    }
    if (validAfter > now + 120) {
      return { ok: false, reason: `authorization ${i + 1} is not yet valid` };
    }
    if (validBefore <= now + 60) {
      return { ok: false, reason: `authorization ${i + 1} expires too soon — sign again` };
    }
    if (validBefore > now + 3600) {
      return { ok: false, reason: `authorization ${i + 1} is valid for too long (max 1 hour)` };
    }
    let signer: string;
    try {
      signer = await recoverAuthorizationSigner(payload);
    } catch {
      return { ok: false, reason: `authorization ${i + 1} has an invalid signature` };
    }
    if (signer.toLowerCase() !== payerAddress.toLowerCase()) {
      return { ok: false, reason: `authorization ${i + 1} was not signed by the claimed wallet` };
    }
    const expectedReq = buildPaymentRequirements({
      amountCents: expected[i]!.amountCents,
      payTo,
    });
    if (JSON.stringify(payload.accepted) !== JSON.stringify(expectedReq)) {
      return { ok: false, reason: `authorization ${i + 1} has mismatched payment requirements` };
    }
  }
  return { ok: true };
}

/**
 * Executor that settles authorizations the user signed in their
 * browser, in order, one per handoff. It never signs anything: it
 * has no private key. When the payloads run out, or one does not
 * match the handoff amount, the payment is unresolved — never
 * silently retried with the shared wallet.
 */
export class PreSignedPaymentExecutor {
  private facilitator: FacilitatorClient;
  private payloads: PaymentPayload[];

  constructor(opts: {
    facilitator?: FacilitatorClient;
    facilitatorUrl?: string;
    payloads: PaymentPayload[];
  }) {
    this.facilitator =
      opts.facilitator ?? new FacilitatorClient(opts.facilitatorUrl);
    this.payloads = [...opts.payloads];
  }

  async pay(input: {
    amountCents: number;
    description: string;
  }): Promise<PaymentExecutionResult> {
    const payload = this.payloads.shift();
    if (!payload) {
      return { reason: "no signed authorization left for this handoff", status: "unresolved" };
    }
    const requirements = buildPaymentRequirements({
      amountCents: input.amountCents,
      payTo: payload.payload.authorization.to,
    });
    if (payload.payload.authorization.value !== centsToAtomicUnits(input.amountCents).toString()) {
      return { reason: "signed authorization amount does not match this handoff", status: "unresolved" };
    }
    let verified: FacilitatorVerifyResult;
    try {
      verified = await this.facilitator.verify(payload, requirements);
    } catch (err) {
      return {
        reason: err instanceof Error ? err.message : "facilitator verify failed",
        status: "unresolved",
      };
    }
    if (!verified.isValid) {
      return {
        reason: verified.invalidReason ?? "facilitator verification failed",
        status: "unresolved",
      };
    }
    let settled: FacilitatorSettleResult;
    try {
      settled = await this.facilitator.settle(payload, requirements);
    } catch (err) {
      return {
        reason: err instanceof Error ? err.message : "facilitator settle failed",
        status: "unresolved",
      };
    }
    if (settled.success && settled.transaction) {
      return { status: "settled", txHash: settled.transaction };
    }
    if (settled.transaction) {
      return {
        reason: settled.errorReason ?? "settlement_pending",
        status: "unresolved",
        txHash: settled.transaction,
      };
    }
    return {
      reason: settled.errorReason ?? "facilitator settlement failed",
      status: "unresolved",
    };
  }
}

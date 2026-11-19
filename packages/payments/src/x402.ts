import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import type { Hex } from "viem";

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

export const X402_VERSION = 2;
export const NETWORK = "eip155:84532"; // Base Sepolia
export const CHAIN_ID = 84532;
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;
export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

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

export interface PaymentRequirements {
  amount: string;
  asset: string;
  extra: { assetTransferMethod: "eip3009"; name: "USDC"; version: "2" };
  maxTimeoutSeconds: number;
  network: string;
  payTo: string;
  scheme: "exact";
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

export interface Eip3009Authorization {
  from: string;
  nonce: string;
  to: string;
  validAfter: string;
  validBefore: string;
  value: string;
}

export interface PaymentPayload {
  accepted: PaymentRequirements;
  payload: { authorization: Eip3009Authorization; signature: string };
  x402Version: 2;
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

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
    domain: {
      chainId: CHAIN_ID,
      name: "USDC",
      verifyingContract: USDC_BASE_SEPOLIA as Hex,
      version: "2",
    },
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
    domain: {
      chainId: CHAIN_ID,
      name: "USDC",
      verifyingContract: USDC_BASE_SEPOLIA as Hex,
      version: "2",
    },
    message: {
      from: auth.from as Hex,
      nonce: auth.nonce as Hex,
      to: auth.to as Hex,
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      value: BigInt(auth.value),
    },
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

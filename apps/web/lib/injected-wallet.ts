import { disconnect, getAccount, signTypedData } from "wagmi/actions";
import type { Hex } from "viem";
import type { PaymentPayload } from "@coven/payments";
import {
  buildHandoffSigningRequests,
  handoffPayloadFromSignature,
} from "@coven/payments/user-wallet";

export {
  balanceCoversBudget,
  BASE_SEPOLIA_BLOCKSCOUT_ADDRESS,
  getUsdcBalanceCents,
  isValidAddress,
  shortAddress,
  USDC_FAUCET_URL,
} from "@coven/payments/user-wallet";

import { getWagmiConfig } from "./wagmi-config";

/**
 * The user's own wallet, connected through their injected browser
 * extension (MetaMask, Rainbow, Coinbase Wallet, …).
 *
 * There is NO WalletConnect, NO QR code, NO project ID, NO wallet
 * generation, NO private key, and NO key storage in this app. The
 * extension itself signs each EIP-3009 authorization — the key
 * never leaves the extension. Only the signed payloads and the
 * address are sent to the server (see buildUserJobRequest).
 *
 * If no extension is installed, or nothing is connected, every
 * function here fails plainly instead of pretending a wallet
 * exists; the demo path is the only way to summon then.
 */

export const NO_WALLET_CONNECTED_MESSAGE =
  "No browser wallet connected: click “Connect browser wallet” and approve in your wallet extension (MetaMask, Rainbow, or Coinbase Wallet). Mobile wallets without a browser extension cannot connect this way.";

/** One EIP-3009 signature per agent handoff: seeker, weaver, keeper, warden. */
export const HANDOFF_SIGNATURE_COUNT = 4;

/** Progress while the wallet signs the handoff authorizations. */
export interface SigningProgress {
  /** Signatures collected so far (including any resumed ones). */
  done: number;
  /** Total signatures for this job — always HANDOFF_SIGNATURE_COUNT. */
  total: number;
}

/**
 * Thrown when one of the handoff signatures fails. Carries the
 * signatures already collected, so the UI can resume from the
 * failed one instead of making the user start all 4 over. The
 * message is plain — no viem internals — and names the failed
 * signature (e.g. "Signature 2 of 4 was rejected in your wallet.").
 */
export class HandoffSigningError extends Error {
  /** 0-based index of the signature that failed. */
  readonly failedIndex: number;
  /** Total signatures for this job. */
  readonly total: number;
  /** Authorizations already signed before the failure. */
  readonly signedAuthorizations: PaymentPayload[];
  /** True when the wallet said the user rejected it. */
  readonly rejected: boolean;

  constructor(input: {
    failedIndex: number;
    message: string;
    rejected: boolean;
    signedAuthorizations: PaymentPayload[];
    total: number;
  }) {
    super(input.message);
    this.name = "HandoffSigningError";
    this.failedIndex = input.failedIndex;
    this.rejected = input.rejected;
    this.signedAuthorizations = input.signedAuthorizations;
    this.total = input.total;
  }
}

/** True when an error is a failed handoff signature (see above). */
export function isHandoffSigningError(err: unknown): err is HandoffSigningError {
  return err instanceof HandoffSigningError;
}

/** True when the wallet reports the user rejected a request (viem code 4001). */
function isUserRejection(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    if ((err as { code?: unknown }).code === 4001) return true;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && /user (rejected|denied)/i.test(message)) return true;
  }
  return false;
}

/** The connected wallet's address, or null when nothing is connected. */
export function getConnectedAddress(): string | null {
  return getAccount(getWagmiConfig()).address ?? null;
}

/** Disconnect the connected wallet. A no-op when nothing is connected. */
export async function disconnectWallet(): Promise<void> {
  await disconnect(getWagmiConfig());
}

/**
 * Sign the 4 handoff authorizations with the CONNECTED extension.
 * Each signature is requested from the extension (the user approves
 * in MetaMask / Rainbow / etc.); the key never touches this page.
 * Returns only signed payloads — no key material.
 *
 * `onProgress` is called after each signature with how many are
 * collected (including any resumed ones), so the UI can say
 * "Approve signature 2 of 4…" while the wallet prompts. `resumeFrom`
 * continues from authorizations already collected — e.g. after a
 * rejection — instead of signing all 4 again. The signing requests
 * are rebuilt on a resume, so resumed signatures are fresh
 * (new nonces); the kept authorizations stay valid because the
 * server validates each authorization on its own.
 *
 * If one signature fails, throws a HandoffSigningError naming it
 * (e.g. "Signature 2 of 4 was rejected in your wallet.") with the
 * authorizations collected so far attached for a resume.
 */
export async function signHandoffAuthorizations(input: {
  address: string;
  budgetCents: number;
  onProgress?: (progress: SigningProgress) => void;
  resumeFrom?: PaymentPayload[];
}): Promise<{ authorizations: PaymentPayload[]; payerAddress: string }> {
  const config = getWagmiConfig();
  const connected = getAccount(config).address;
  if (!connected || connected.toLowerCase() !== input.address.toLowerCase()) {
    throw new Error(NO_WALLET_CONNECTED_MESSAGE);
  }
  const requests = buildHandoffSigningRequests({
    budgetCents: input.budgetCents,
    payerAddress: input.address,
  });
  const total = requests.length;
  const resumeFrom = input.resumeFrom ?? [];
  if (resumeFrom.length > total) {
    throw new Error("Cannot resume signing: more signatures than this job needs.");
  }
  const authorizations: PaymentPayload[] = [...resumeFrom];
  if (resumeFrom.length > 0) {
    input.onProgress?.({ done: resumeFrom.length, total });
  }
  for (let i = resumeFrom.length; i < requests.length; i++) {
    const request = requests[i];
    try {
      const signature = await signTypedData(config, {
        account: input.address as Hex,
        domain: request.domain,
        message: request.message,
        primaryType: request.primaryType,
        types: request.types,
      });
      authorizations.push(handoffPayloadFromSignature(request, signature));
      input.onProgress?.({ done: authorizations.length, total });
    } catch (err) {
      const rejected = isUserRejection(err);
      const message = rejected
        ? `Signature ${i + 1} of ${total} was rejected in your wallet.`
        : `Signature ${i + 1} of ${total} could not be signed.`;
      throw new HandoffSigningError({
        failedIndex: i,
        message,
        rejected,
        signedAuthorizations: [...authorizations],
        total,
      });
    }
  }
  return { authorizations, payerAddress: input.address };
}

export interface UserJobRequest {
  authorizations: PaymentPayload[];
  budgetCents: number;
  job: string;
  payerAddress: string;
  paymentMode: "user";
}

/**
 * Build the POST /api/jobs body for a user-funded job. The connected
 * extension signs here; only the address and signed authorizations
 * leave the browser. Passes `onProgress` and `resumeFrom` through
 * to signHandoffAuthorizations (see above) so the UI can show
 * progress and resume after a rejected signature.
 */
export async function buildUserJobRequest(input: {
  address: string;
  budgetCents: number;
  job: string;
  onProgress?: (progress: SigningProgress) => void;
  resumeFrom?: PaymentPayload[];
}): Promise<UserJobRequest> {
  const { authorizations, payerAddress } = await signHandoffAuthorizations({
    address: input.address,
    budgetCents: input.budgetCents,
    onProgress: input.onProgress,
    resumeFrom: input.resumeFrom,
  });
  return {
    authorizations,
    budgetCents: input.budgetCents,
    job: input.job,
    payerAddress,
    paymentMode: "user",
  };
}

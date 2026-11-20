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
 */
export async function signHandoffAuthorizations(input: {
  address: string;
  budgetCents: number;
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
  const authorizations: PaymentPayload[] = [];
  for (const request of requests) {
    const signature = await signTypedData(config, {
      account: input.address as Hex,
      domain: request.domain,
      message: request.message,
      primaryType: request.primaryType,
      types: request.types,
    });
    authorizations.push(handoffPayloadFromSignature(request, signature));
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
 * leave the browser.
 */
export async function buildUserJobRequest(input: {
  address: string;
  budgetCents: number;
  job: string;
}): Promise<UserJobRequest> {
  const { authorizations, payerAddress } = await signHandoffAuthorizations({
    address: input.address,
    budgetCents: input.budgetCents,
  });
  return {
    authorizations,
    budgetCents: input.budgetCents,
    job: input.job,
    payerAddress,
    paymentMode: "user",
  };
}

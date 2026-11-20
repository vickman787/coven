import type { Hex, PaymentPayload } from "@coven/payments";
import {
  addressFromPrivateKey,
  BASE_SEPOLIA_BLOCKSCOUT_ADDRESS,
  generateUserWallet,
  getUsdcBalanceCents,
  isValidAddress,
  shortAddress,
  signUserHandoffAuthorizations,
  USDC_FAUCET_URL,
} from "@coven/payments/user-wallet";

export {
  BASE_SEPOLIA_BLOCKSCOUT_ADDRESS,
  isValidAddress,
  shortAddress,
  USDC_FAUCET_URL,
};

export { balanceCoversBudget } from "@coven/payments/user-wallet";

/**
 * The user's own testnet wallet, held ONLY in this browser.
 *
 * Storage: localStorage key `coven:user-wallet`, a JSON object
 * { address, privateKey }. It is never sent to the server — the
 * Summon flow sends only the address and the signed EIP-3009
 * authorizations (see buildUserJobRequest, tested to exclude the
 * key). It is never written to Postgres, a cookie, or a log.
 *
 * Warnings the UI must show (see UserWallet.tsx): testnet only, the
 * key lives only in this browser, clearing browser data loses it,
 * anyone with the key controls the wallet — export it if the funds
 * matter. Test USDC has no real value; never import a mainnet key.
 */

export interface UserWallet {
  address: string;
  privateKey: Hex;
}

const USER_WALLET_KEY = "coven:user-wallet";

export function loadUserWallet(): UserWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_WALLET_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { address?: unknown }).address !== "string" ||
      typeof (parsed as { privateKey?: unknown }).privateKey !== "string"
    ) {
      return null;
    }
    const wallet = parsed as UserWallet;
    if (!isValidAddress(wallet.address)) return null;
    if (addressFromPrivateKey(wallet.privateKey) !== wallet.address) return null;
    return wallet;
  } catch {
    return null;
  }
}

export function createUserWallet(): UserWallet {
  const wallet = generateUserWallet() as UserWallet;
  window.localStorage.setItem(USER_WALLET_KEY, JSON.stringify(wallet));
  return wallet;
}

export function importUserWallet(privateKey: string): UserWallet {
  const address = addressFromPrivateKey(privateKey);
  const wallet: UserWallet = { address, privateKey: privateKey as Hex };
  window.localStorage.setItem(USER_WALLET_KEY, JSON.stringify(wallet));
  return wallet;
}

export function removeUserWallet(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_WALLET_KEY);
}

/** The wallet's test USDC balance in cents, or null when unknown (RPC down). */
export async function getUserWalletBalanceCents(
  address: string,
): Promise<number | null> {
  return getUsdcBalanceCents(address);
}

export interface UserJobRequest {
  authorizations: PaymentPayload[];
  budgetCents: number;
  job: string;
  payerAddress: string;
  paymentMode: "user";
}

/**
 * Build the POST /api/jobs body for a user-funded job. The private
 * key is used to sign here and is deliberately NOT part of the
 * returned request — only the address and signed authorizations
 * leave the browser. (Covered by a test in user-wallet.test.ts.)
 */
export async function buildUserJobRequest(input: {
  budgetCents: number;
  job: string;
  wallet: UserWallet;
}): Promise<UserJobRequest> {
  const { authorizations, payerAddress } = await signUserHandoffAuthorizations({
    budgetCents: input.budgetCents,
    privateKey: input.wallet.privateKey,
  });
  return {
    authorizations,
    budgetCents: input.budgetCents,
    job: input.job,
    payerAddress,
    paymentMode: "user",
  };
}

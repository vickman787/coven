import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import type { Config } from "@wagmi/core";

/**
 * The one and only wallet configuration: an injected browser
 * extension (MetaMask, Rainbow, Coinbase Wallet, …) via
 * `window.ethereum`. No WalletConnect, no QR code, no Reown AppKit
 * modal, no project ID — there is nothing to configure.
 *
 * Base Sepolia testnet only. The key never leaves the extension:
 * the extension signs EIP-3009 authorizations and Coven only ever
 * sees the address and the signed payloads.
 */

export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id;

let config: Config | null = null;

/** The shared wagmi config (Base Sepolia, injected connector). */
export function getWagmiConfig(): Config {
  if (!config) {
    config = createConfig({
      chains: [baseSepolia],
      connectors: [injected()],
      ssr: true,
      transports: {
        [baseSepolia.id]: http(),
      },
    });
  }
  return config;
}

/**
 * True when a wallet extension is present in this browser
 * (`window.ethereum`). False on the server and in browsers with no
 * extension installed — the UI then says so plainly and points at
 * the install pages instead of faking a connection.
 */
export function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { ethereum?: unknown }).ethereum,
  );
}

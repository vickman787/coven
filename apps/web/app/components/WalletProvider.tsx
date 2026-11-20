"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getWagmiConfig } from "@/lib/wagmi-config";

const queryClient = new QueryClient();

/**
 * Wallet providers for the whole app: plain wagmi with the injected
 * browser-extension connector (MetaMask, Rainbow, Coinbase Wallet).
 * No Reown AppKit, no WalletConnect, no QR code, no project ID.
 * The config is created once and is the same on server and client;
 * the injected connector only touches `window.ethereum` when the
 * user actually connects.
 */
export default function WalletProvider({ children }: { children: ReactNode }) {
  const [config] = useState(getWagmiConfig);
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import {
  BASE_SEPOLIA_BLOCKSCOUT_ADDRESS,
  disconnectWallet,
  getUsdcBalanceCents,
  shortAddress,
  USDC_FAUCET_URL,
} from "@/lib/injected-wallet";
import { hasInjectedWallet } from "@/lib/wagmi-config";
import { dollars } from "@/lib/job-state";

/**
 * Connect your browser wallet — the extension already installed on
 * your PC (MetaMask, Rainbow, Coinbase Wallet). The button talks
 * straight to the extension, which holds the key. Coven never sees it.
 *
 * When no extension is installed, the button is disabled and the
 * card says plainly to install one, with links — nothing is faked.
 * When the extension is on the wrong network, the card offers to
 * switch it to Base Sepolia.
 */
export default function ConnectWalletCard() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [balanceUnknown, setBalanceUnknown] = useState(false);

  useEffect(() => {
    setExtensionInstalled(hasInjectedWallet());
  }, []);

  const refreshBalance = useCallback(async (walletAddress: string) => {
    setBalanceUnknown(false);
    const balance = await getUsdcBalanceCents(walletAddress);
    if (balance === null) {
      setBalanceUnknown(true);
      setBalanceCents(null);
    } else {
      setBalanceCents(balance);
    }
  }, []);

  useEffect(() => {
    if (address) void refreshBalance(address);
  }, [address, refreshBalance]);

  const connectExtension = useCallback(() => {
    const injectedConnector =
      connectors.find((c) => c.id === "injected") ?? connectors[0];
    if (!injectedConnector) return;
    connect({ connector: injectedConnector });
  }, [connect, connectors]);

  const onWrongChain = isConnected && chainId !== undefined && chainId !== baseSepolia.id;

  return (
    <section className="mt-10 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
      <h2 className="text-xl font-bold text-[#f8f7ff]">Connect your wallet</h2>
      <p className="mt-2 text-sm text-[#9a9ab0]">
        Jobs can be paid from <strong className="text-[#f8f7ff]">your own testnet wallet</strong>,
        not the shared demo wallet. Connect your browser wallet extension
        and your jobs will settle from it. Your key stays in the extension —
        signing in creates your Coven account from this wallet. No password,
        no QR code.
      </p>

      {extensionInstalled === false ? (
        <>
          <button
            type="button"
            disabled
            className="mt-4 w-full cursor-not-allowed rounded-lg bg-[#7c3aed] px-6 py-3 font-bold text-white opacity-50"
          >
            Connect browser wallet
          </button>
          <p className="mt-3 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-3 text-sm text-[#f8f7ff]">
            No wallet extension found in this browser. Install one first —
            MetaMask, Rainbow, or Coinbase Wallet — then reload this page.
            Until then, jobs run on the demo wallet.
          </p>
          <p className="mt-3 text-sm">
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#a78bfa] underline"
            >
              Install MetaMask
            </a>{" "}
            ·{" "}
            <a
              href="https://rainbow.me/download"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#a78bfa] underline"
            >
              Install Rainbow
            </a>{" "}
            ·{" "}
            <a
              href="https://www.coinbase.com/wallet/downloads"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#a78bfa] underline"
            >
              Install Coinbase Wallet
            </a>
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={connectExtension}
            disabled={isConnected || isPending || extensionInstalled === null}
            className="mt-4 w-full rounded-lg bg-[#7c3aed] px-6 py-3 font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {isConnected
              ? "Browser wallet connected"
              : isPending
                ? "Waiting for your extension…"
                : "Connect browser wallet"}
          </button>
          {connectError ? (
            <p role="alert" className="mt-3 text-sm text-[#ef4444]">
              Could not connect: {connectError.message}
            </p>
          ) : null}
        </>
      )}

      {isConnected && address ? (
        <>
          <p className="mt-4 text-sm text-[#9a9ab0]">
            Connected:{" "}
            <span className="font-mono text-[#f8f7ff]">{shortAddress(address)}</span>{" "}
            ·{" "}
            <a
              href={BASE_SEPOLIA_BLOCKSCOUT_ADDRESS(address)}
              target="_blank"
              rel="noreferrer"
              className="text-[#a78bfa] underline"
            >
              View on Blockscout
            </a>
          </p>
          {onWrongChain ? (
            <p className="mt-3 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-3 text-sm text-[#f8f7ff]">
              Your wallet is on the wrong network. Coven pays in test USDC
              on Base Sepolia.
              <button
                type="button"
                onClick={() => switchChain({ chainId: baseSepolia.id })}
                className="mt-2 block rounded-lg bg-[#f5c518] px-4 py-2 text-sm font-bold text-black"
              >
                Switch to Base Sepolia
              </button>
            </p>
          ) : null}
          <p className="mt-2 text-lg font-bold text-[#f8f7ff]">
            Balance:{" "}
            {balanceUnknown
              ? "unknown — could not reach the network"
              : balanceCents === null
                ? "checking…"
                : dollars(balanceCents)}
            {" "}
            <button
              type="button"
              onClick={() => void refreshBalance(address)}
              className="text-sm font-semibold text-[#a78bfa] underline"
            >
              Refresh
            </button>
          </p>
          <p className="mt-2 text-sm text-[#9a9ab0]">
            Fund it free at{" "}
            <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#a78bfa] underline">
              faucet.circle.com
            </a>{" "}
            — choose USDC, Base Sepolia, paste your address, pass the captcha.
            A $5.00 job needs at least $5.00 of test USDC in the wallet.
          </p>
          <p className="mt-3 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-3 text-sm text-[#f8f7ff]">
            Your key stays in your browser extension — Coven never sees it. Each
            job pays your wallet to itself (a self-transfer, like the
            demo), so your test USDC is not spent — the onchain settlement
            still proves your wallet paid.
          </p>
          <button
            type="button"
            onClick={() => {
              disconnect();
              void disconnectWallet();
            }}
            className="mt-4 rounded-lg border border-[#ef4444]/50 px-4 py-2 text-sm font-semibold text-[#ef4444]"
          >
            Disconnect wallet
          </button>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#9a9ab0]">
          Not connected yet. Jobs still work on the{" "}
          <strong className="text-[#f8f7ff]">demo wallet</strong> — the shared test wallet,
          labelled as such in the ledger.
        </p>
      )}
    </section>
  );
}

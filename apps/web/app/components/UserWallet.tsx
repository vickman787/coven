"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BASE_SEPOLIA_BLOCKSCOUT_ADDRESS,
  createUserWallet,
  getUserWalletBalanceCents,
  importUserWallet,
  loadUserWallet,
  removeUserWallet,
  shortAddress,
  USDC_FAUCET_URL,
} from "@/lib/user-wallet";
import type { UserWallet } from "@/lib/user-wallet";
import { dollars } from "@/lib/job-state";

/**
 * Your wallet — the per-user funding card on the home page.
 *
 * A user can create a fresh Base Sepolia testnet wallet in this
 * browser, or import one they already have. The private key is
 * stored ONLY in this browser's localStorage and never leaves it;
 * the card says so, with export and remove controls. Funding is via
 * the Circle faucet (free test USDC, captcha required). Balance is
 * read onchain and shown here, so a user can see whether a job is
 * affordable before summoning.
 */
export default function UserWalletCard({
  onWalletChange,
}: {
  onWalletChange: (wallet: UserWallet | null) => void;
}) {
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [balanceUnknown, setBalanceUnknown] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshBalance = useCallback(async (address: string) => {
    setBalanceUnknown(false);
    const balance = await getUserWalletBalanceCents(address);
    if (balance === null) {
      setBalanceUnknown(true);
      setBalanceCents(null);
    } else {
      setBalanceCents(balance);
    }
  }, []);

  useEffect(() => {
    const existing = loadUserWallet();
    setWallet(existing);
    onWalletChange(existing);
    if (existing) void refreshBalance(existing.address);
    // onWalletChange is a stable parent callback in practice; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function adopt(next: UserWallet | null) {
    setWallet(next);
    setError(null);
    onWalletChange(next);
    if (next) void refreshBalance(next.address);
  }

  function create() {
    try {
      adopt(createUserWallet());
    } catch {
      setError("Could not create a wallet in this browser.");
    }
  }

  function doImport() {
    try {
      adopt(importUserWallet(importKey.trim()));
      setImportKey("");
    } catch {
      setError("That private key does not look valid — it must be 0x followed by 64 hex characters.");
    }
  }

  function remove() {
    if (!window.confirm("Remove this wallet from this browser? Export the private key first if you want to keep it — removing it here cannot be undone.")) {
      return;
    }
    removeUserWallet();
    adopt(null);
    setShowKey(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the address is still visible to copy by hand.
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
      <h2 className="text-xl font-bold text-[#f8f7ff]">Your wallet</h2>
      <p className="mt-2 text-sm text-[#9a9ab0]">
        Jobs can be paid from <strong className="text-[#f8f7ff]">your own testnet wallet</strong>,
        not the shared demo wallet. Create one here, fund it with free test USDC,
        and your jobs will settle from it. No account, no login.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-sm text-[#f8f7ff]">
          {error}
        </p>
      ) : null}

      {!wallet ? (
        <>
          <button
            type="button"
            onClick={create}
            className="mt-4 w-full rounded-lg bg-[#7c3aed] px-6 py-3 font-bold text-white hover:brightness-110"
          >
            Create my testnet wallet
          </button>
          <div className="mt-4">
            <label htmlFor="import-key" className="block text-sm font-semibold text-[#f8f7ff]">
              Or import a wallet you already have
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="import-key"
                type="password"
                autoComplete="off"
                placeholder="0x… private key (testnet only)"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-sm text-[#f8f7ff] outline-none focus:border-[#7c3aed]"
              />
              <button
                type="button"
                onClick={doImport}
                disabled={!importKey.trim()}
                className="rounded-lg border border-[#7c3aed] px-4 py-2 text-sm font-bold text-[#a78bfa] disabled:opacity-50"
              >
                Import
              </button>
            </div>
            <p className="mt-2 text-xs text-[#9a9ab0]">
              Never import a mainnet key or a key that holds real money. This is a testnet demo.
            </p>
          </div>
          <p className="mt-4 text-sm text-[#9a9ab0]">
            No wallet yet? Jobs still work on the{" "}
            <strong className="text-[#f8f7ff]">demo wallet</strong> — the shared test wallet,
            labelled as such in the ledger.
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-[#9a9ab0]">
            Address:{" "}
            <button
              type="button"
              onClick={() => void copy(wallet.address)}
              className="font-mono text-[#f8f7ff] underline"
              title="Copy full address"
            >
              {shortAddress(wallet.address)}
            </button>{" "}
            {copied ? <span className="text-[#22c55e]">copied</span> : null}
            {" · "}
            <a
              href={BASE_SEPOLIA_BLOCKSCOUT_ADDRESS(wallet.address)}
              target="_blank"
              rel="noreferrer"
              className="text-[#a78bfa] underline"
            >
              View on Blockscout
            </a>
          </p>
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
              onClick={() => void refreshBalance(wallet.address)}
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
            Your private key lives only in this browser (localStorage). Coven&apos;s
            server never sees it. Clearing browser data loses this wallet — export
            the key below if the funds matter. Each job pays your wallet to itself
            (a self-transfer, like the demo), so your test USDC is not spent — the
            onchain settlement still proves your wallet paid.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-[#f8f7ff]"
            >
              {showKey ? "Hide private key" : "Show private key to export it"}
            </button>
            <button
              type="button"
              onClick={remove}
              className="rounded-lg border border-[#ef4444]/50 px-4 py-2 text-sm font-semibold text-[#ef4444]"
            >
              Remove wallet from this browser
            </button>
          </div>
          {showKey ? (
            <p className="mt-3 break-all rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 font-mono text-xs text-[#f8f7ff]">
              {wallet.privateKey}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

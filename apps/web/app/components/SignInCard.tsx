"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import ConnectWalletCard from "./ConnectWallet";
import { shortAddress } from "@/lib/injected-wallet";

/**
 * Sign in with your wallet — the whole account flow on one card.
 * 1. Connect the browser extension (the key never leaves it).
 * 2. Sign the login message the server issued for your address.
 * 3. The server verifies the signature and issues a session.
 * No email, no password, no OAuth. Signing in creates the
 * account on first use; later sign-ins reuse it.
 */
export default function SignInCard() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const signIn = useCallback(async () => {
    if (!address) return;
    setError(null);
    setSigning(true);
    try {
      const nonceRes = await fetch("/api/auth/nonce", {
        body: JSON.stringify({ address }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!nonceRes.ok) throw new Error("Could not start sign-in. Try again.");
      const { message } = (await nonceRes.json()) as { message: string };
      // The extension asks the user to approve this signature —
      // it proves they own the wallet. Nothing secret is signed.
      const signature = await signMessageAsync({ account: address, message });
      const verifyRes = await fetch("/api/auth/verify", {
        body: JSON.stringify({ address, message, signature }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!verifyRes.ok) {
        const data = (await verifyRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Sign-in failed. Try again.");
      }
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
    } finally {
      setSigning(false);
    }
  }, [address, router, signMessageAsync]);

  return (
    <div className="rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
      <h2 className="text-xl font-bold text-[#f8f7ff]">Sign in with your wallet</h2>
      <p className="mt-2 text-sm text-[#9a9ab0]">
        Your wallet address is your account. Connect your browser extension,
        then sign one login message to prove you own it — no password, no
        email, and your key never leaves the extension.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-sm text-[#f8f7ff]">
          {error}
        </p>
      ) : null}

      {isConnected && address ? (
        <>
          <p className="mt-4 text-sm text-[#9a9ab0]">
            Wallet connected:{" "}
            <span className="font-mono text-[#f8f7ff]">{shortAddress(address)}</span>
          </p>
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={signing}
            className="mt-4 w-full rounded-lg bg-[#f5c518] px-6 py-4 text-lg font-bold text-black hover:brightness-110 disabled:opacity-50"
          >
            {signing ? "Waiting for your signature…" : "Sign in"}
          </button>
          <p className="mt-3 text-center text-sm text-[#9a9ab0]">
            Your extension will ask you to sign a short login message. That
            signature is the whole sign-in — nothing else leaves your wallet.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#9a9ab0]">
          Connect your wallet below, then sign in.
        </p>
      )}

      <div className="mt-6">
        <ConnectWalletCard />
      </div>

      <p className="mt-4 text-center text-sm text-[#9a9ab0]">
        Just looking?{" "}
        <a href="/demo" className="font-semibold text-[#a78bfa] underline">
          Try the demo — no sign-in
        </a>
      </p>
    </div>
  );
}

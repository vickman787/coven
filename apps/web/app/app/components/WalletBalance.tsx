"use client";

import { useCallback, useEffect, useState } from "react";
import { getUsdcBalanceCents } from "@/lib/injected-wallet";
import { dollars } from "@/lib/job-state";

/** The connected wallet's test USDC balance, read from the public Base Sepolia RPC. */
export default function WalletBalance({ address }: { address: string }) {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [unknown, setUnknown] = useState(false);

  const refresh = useCallback(async () => {
    setUnknown(false);
    const balance = await getUsdcBalanceCents(address);
    if (balance === null) {
      setUnknown(true);
      setBalanceCents(null);
    } else {
      setBalanceCents(balance);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <p className="mt-1 text-2xl font-bold text-[#f8f7ff]">
      {unknown
        ? "unknown — could not reach the network"
        : balanceCents === null
          ? "checking…"
          : dollars(balanceCents)}{" "}
      <button
        type="button"
        onClick={() => void refresh()}
        className="text-sm font-semibold text-[#a78bfa] underline"
      >
        Refresh
      </button>
    </p>
  );
}

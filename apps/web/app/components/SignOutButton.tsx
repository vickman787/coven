"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDisconnect } from "wagmi";
import { signOut } from "@/lib/auth-client";

/** Sign out of the account and disconnect the wallet extension. */
export default function SignOutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const { disconnect } = useDisconnect();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      disconnect();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }, [disconnect, router]);

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={signingOut}
      className="rounded-lg border border-[#ef4444]/50 px-4 py-2 text-sm font-semibold text-[#ef4444] disabled:opacity-50"
    >
      {signingOut ? "Signing out…" : label}
    </button>
  );
}

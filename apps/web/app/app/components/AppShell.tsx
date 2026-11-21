"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDisconnect } from "wagmi";
import { signOut } from "@/lib/auth-client";
import { shortAddress } from "@/lib/injected-wallet";

const NAV: [string, string][] = [
  ["/app", "Dashboard"],
  ["/app/jobs", "Jobs"],
  ["/app/wallet", "Wallet"],
  ["/app/settings", "Settings"],
];

/**
 * The app shell: sidebar navigation for the signed-in product —
 * Dashboard, Jobs, Wallet, Settings — plus the signed-in account
 * and sign-out. On small screens the nav is a horizontal bar.
 */
export default function AppShell({
  address,
  children,
  displayName,
}: {
  address: string;
  children: React.ReactNode;
  displayName: string | null;
}) {
  const pathname = usePathname();
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

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-white/10 bg-[#0b0b14] lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-6 py-5 lg:block">
          <Link href="/app" className="text-lg font-bold text-[#f8f7ff]">
            Coven <span className="text-[#f5c518]">✦</span>
          </Link>
          <p className="text-xs text-[#9a9ab0] lg:mt-1">KIROWEEN 2026</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:gap-1 lg:px-4 lg:pb-0">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${
                isActive(href)
                  ? "bg-[#7c3aed]/20 text-[#f8f7ff]"
                  : "text-[#9a9ab0] hover:bg-white/[0.03] hover:text-[#f8f7ff]"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/demo"
            className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-[#9a9ab0] hover:bg-white/[0.03] hover:text-[#f8f7ff]"
          >
            Try the demo
          </Link>
        </nav>
        <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
          <p className="truncate text-sm font-semibold text-[#f8f7ff]">
            {displayName ?? shortAddress(address)}
          </p>
          <p className="truncate font-mono text-xs text-[#9a9ab0]">{shortAddress(address)}</p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="mt-3 w-full rounded-lg border border-[#ef4444]/50 px-4 py-2 text-sm font-semibold text-[#ef4444] disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-3 lg:hidden">
          <p className="truncate text-sm font-semibold text-[#f8f7ff]">
            {displayName ?? shortAddress(address)}
          </p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="rounded-lg border border-[#ef4444]/50 px-3 py-1.5 text-sm font-semibold text-[#ef4444] disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import WalletProvider from "./components/WalletProvider";

export const metadata: Metadata = {
  description:
    "Coven — a Kiro Crew of AI agents that does a job together, each with a scoped budget, paying the next agent per task with x402, with an audit ledger.",
  title: "Coven — Summon a Coven",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

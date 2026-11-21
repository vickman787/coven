import Link from "next/link";
import WalletBalance from "../components/WalletBalance";
import SignOutButton from "../../components/SignOutButton";
import { getLedger } from "@/lib/coven";
import { displayNameOf, getSessionAccount } from "@/lib/auth";
import { dollars, EXPLORER_TX } from "@/lib/money";
import {
  BASE_SEPOLIA_BLOCKSCOUT_ADDRESS,
  USDC_FAUCET_URL,
} from "@/lib/injected-wallet";

/**
 * Wallet — the signed-in account's wallet: address, test USDC
 * balance, how to fund it free, and every payment from jobs that
 * wallet paid for, newest first. Settled payments show their x402
 * hash; unresolved ones are marked unresolved, never as settled.
 */
export default async function WalletPage() {
  const account = await getSessionAccount();
  if (!account) return null; // The app layout redirects when signed out.
  const ledger = await getLedger();
  const payments = await ledger.listAccountPayments(account.address, 50);
  const settledCents = payments
    .filter((p) => p.status === "settled")
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <>
      <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
        COVEN · WALLET
      </p>
      <h1 className="mt-4 text-4xl font-bold leading-tight text-[#f8f7ff]">
        Your <span className="text-[#f5c518]">Wallet</span>
      </h1>
      <p className="mt-2 text-[#9a9ab0]">
        Signed in as {displayNameOf(account)}. This wallet pays for your
        jobs — each job pays your wallet to itself, so your test USDC is
        not spent, but every settlement is a real onchain transaction.
      </p>

      <div className="mt-8 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">
          Wallet address
        </p>
        <p className="mt-1 break-all font-mono text-[#f8f7ff]">{account.address}</p>
        <p className="mt-2 text-sm">
          <a
            href={BASE_SEPOLIA_BLOCKSCOUT_ADDRESS(account.address)}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#a78bfa] underline"
          >
            View on Blockscout
          </a>
        </p>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">
          Test USDC balance · Base Sepolia
        </p>
        <WalletBalance address={account.address} />
        <p className="mt-2 text-sm text-[#9a9ab0]">
          Fund it free at{" "}
          <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-[#a78bfa] underline">
            faucet.circle.com
          </a>{" "}
          — choose USDC, Base Sepolia, paste your address, pass the captcha.
          A $5.00 job needs at least $5.00 of test USDC.
        </p>
        <p className="mt-4 text-sm text-[#9a9ab0]">
          Settled from this wallet so far:{" "}
          <strong className="text-[#22c55e]">{dollars(settledCents)}</strong>
        </p>
        <div className="mt-6">
          <SignOutButton label="Disconnect wallet & sign out" />
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-[#f8f7ff]">Payment history</h2>
        {payments.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
            <p className="text-[#f8f7ff]">No payments yet.</p>
            <p className="mt-1 text-[#9a9ab0]">
              Summon a Coven from the dashboard — its payments will show up
              here, settled with their onchain hashes.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {payments.map((payment) => (
              <li key={`${payment.jobId}-${payment.amountCents}-${payment.createdAt ?? ""}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-[#f8f7ff]">{payment.description}</p>
                    <p className="mt-1 text-sm text-[#9a9ab0]">
                      {dollars(payment.amountCents)} · {payment.status}
                      {payment.createdAt ? ` · ${new Date(payment.createdAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/app/jobs/${payment.jobId}/agents`}
                    className="shrink-0 text-sm font-semibold text-[#a78bfa] underline"
                  >
                    Open job
                  </Link>
                </div>
                {payment.status === "settled" && payment.x402Hash ? (
                  <p className="mt-2 text-sm">
                    <a
                      href={EXPLORER_TX(payment.x402Hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[#22c55e] underline"
                    >
                      {payment.x402Hash.slice(0, 10)}…{payment.x402Hash.slice(-6)} — view onchain
                    </a>
                  </p>
                ) : payment.status === "unresolved" ? (
                  <p className="mt-2 text-sm text-[#f59e0b]">
                    Unresolved — the outcome is unknown, never shown as settled.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

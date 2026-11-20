"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import SiteNav from "../components/SiteNav";
import ConnectWalletCard from "../components/ConnectWallet";
import { dollars, readMyJobs, rememberMyJob, summonCoven } from "@/lib/job-state";
import {
  balanceCoversBudget,
  buildUserJobRequest,
  getUsdcBalanceCents,
  shortAddress,
} from "@/lib/injected-wallet";

/**
 * The user's workspace: connect a wallet, summon a job, and see
 * your jobs at a glance. This is where the work happens — the
 * landing page only explains Coven.
 *
 * The job input starts EMPTY. The example text is only a grey
 * placeholder, never a prefilled value and never submitted as a
 * job. The budget defaults to $5.00.
 */
const JOB_PLACEHOLDER = "research 10 competitors and write a one-page brief";

interface MyJobItem {
  approvedBudgetCents: number;
  createdAt?: string;
  description: string;
  id: string;
  payerAddress?: string;
  paymentMode?: "demo" | "user";
  settledCents: number;
  status: string;
  unresolvedCents: number;
}

export default function WorkspacePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [job, setJob] = useState("");
  const [budget, setBudget] = useState("5.00");
  const [error, setError] = useState<string | null>(null);
  const [summoning, setSummoning] = useState(false);
  const [myJobs, setMyJobs] = useState<MyJobItem[] | null>(null);

  const loadMyJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: MyJobItem[] };
      const mine = readMyJobs();
      const filtered = data.jobs.filter(
        (j) =>
          mine.includes(j.id) ||
          (isConnected && address && j.payerAddress?.toLowerCase() === address.toLowerCase()),
      );
      setMyJobs(filtered.slice(0, 5));
    } catch {
      // History is a glance, not the job itself — never block summoning on it.
    }
  }, [address, isConnected]);

  useEffect(() => {
    void loadMyJobs();
  }, [loadMyJobs]);

  const summon = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmed = job.trim();
      if (trimmed.length < 3) {
        setError("Describe the job first — a few words is enough.");
        return;
      }
      setSummoning(true);
      try {
        const cents = Math.round(Number.parseFloat(budget) * 100);
        if (isConnected && address) {
          // Browser extension: check the balance first, then ask the
          // extension to sign the 4 handoff authorizations. A low
          // balance fails here, honestly, and never falls back to
          // the demo wallet.
          const balance = await getUsdcBalanceCents(address);
          if (!balanceCoversBudget(balance, cents)) {
            throw new Error(
              `Insufficient test USDC: your wallet holds $${((balance ?? 0) / 100).toFixed(2)} but this job needs $${(cents / 100).toFixed(2)}. Fund it at faucet.circle.com (USDC, Base Sepolia) and try again.`,
            );
          }
          const request = await buildUserJobRequest({
            address,
            budgetCents: cents,
            job: trimmed,
          });
          const { jobId: id } = await summonCoven(request);
          rememberMyJob(id);
          router.push(`/workspace/jobs/${id}/agents`);
          return;
        }
        const { jobId: id } = await summonCoven({ budgetCents: cents, job: trimmed });
        rememberMyJob(id);
        router.push(`/workspace/jobs/${id}/agents`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not summon a coven");
      } finally {
        setSummoning(false);
      }
    },
    [address, budget, isConnected, job, router],
  );

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · WORKSPACE
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Summon a <span className="text-[#f5c518]">Coven</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a9ab0]">
          Describe the job, set a budget, and the Coven does it — five
          agents, each paying the next, every payment in the ledger.
        </p>

        {error ? (
          <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
            {error}
          </p>
        ) : null}

        <form
          onSubmit={summon}
          className="mt-10 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6"
        >
          <label htmlFor="job" className="block text-sm font-semibold uppercase tracking-wider text-[#f8f7ff]">
            Job
          </label>
          <textarea
            id="job"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            rows={3}
            placeholder={JOB_PLACEHOLDER}
            className="mt-2 w-full rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-[#f8f7ff] outline-none placeholder:text-[#9a9ab0]/60 focus:border-[#7c3aed]"
          />
          <label htmlFor="budget" className="mt-6 block text-sm font-semibold uppercase tracking-wider text-[#f8f7ff]">
            Budget (USDC)
          </label>
          <input
            id="budget"
            type="number"
            min="1"
            max="10"
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-[#f8f7ff] outline-none focus:border-[#7c3aed]"
          />
          <button
            type="submit"
            disabled={summoning}
            className="mt-8 w-full rounded-lg bg-[#f5c518] px-6 py-4 text-lg font-bold text-black hover:brightness-110 disabled:opacity-50"
          >
            {summoning ? "Summoning…" : "Summon a Coven"}
          </button>
          <p className="mt-3 text-center text-sm text-[#9a9ab0]">
            No login. No signup. Budget $1.00–$10.00, test USDC on Base Sepolia.
          </p>
          <p className="mt-2 text-center text-sm text-[#9a9ab0]">
            {isConnected && address ? (
              <>
                Paying from <strong className="text-[#f8f7ff]">your wallet {shortAddress(address)}</strong> —
                this job settles from it, not the demo wallet.
              </>
            ) : (
              <>
                Paying from the <strong className="text-[#f8f7ff]">demo wallet</strong> (shared test wallet).
                Connect your own wallet below to fund jobs yourself.
              </>
            )}
          </p>
        </form>

        <ConnectWalletCard />

        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-[#f8f7ff]">Your jobs</h2>
            <Link href="/workspace/history" className="text-sm font-semibold text-[#a78bfa] underline">
              All history
            </Link>
          </div>
          {myJobs === null ? (
            <p className="mt-4 text-[#9a9ab0]">Loading your jobs…</p>
          ) : myJobs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
              <p className="text-[#f8f7ff]">No jobs yet.</p>
              <p className="mt-1 text-[#9a9ab0]">
                Summon your first Coven above — it will show up here.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {myJobs.map((j) => (
                <li key={j.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <Link href={`/workspace/jobs/${j.id}/agents`} className="block">
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-bold text-[#f8f7ff]">{j.description}</p>
                      <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-xs font-semibold text-[#9a9ab0]">
                        {j.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#9a9ab0]">
                      Budget {dollars(j.approvedBudgetCents)} · Settled{" "}
                      {dollars(j.settledCents)} · Unresolved{" "}
                      {dollars(j.unresolvedCents)}
                      {j.createdAt ? ` · ${new Date(j.createdAt).toLocaleString()}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#9a9ab0]">
                      {j.paymentMode === "user" && j.payerAddress
                        ? `Paid from your wallet ${shortAddress(j.payerAddress)}`
                        : "Paid from the demo wallet"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 text-sm text-[#9a9ab0]">
          Settled + reserved + unresolved = approved budget. Always. ·{" "}
          <Link href="/workspace/history" className="text-[#a78bfa] underline">History</Link>
        </footer>
      </main>
    </>
  );
}

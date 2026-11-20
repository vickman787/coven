"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import JobView from "./components/JobView";
import SiteNav from "./components/SiteNav";
import UserWalletCard from "./components/UserWallet";
import { rememberMyJob, summonCoven } from "@/lib/job-state";
import {
  balanceCoversBudget,
  buildUserJobRequest,
  getUserWalletBalanceCents,
  shortAddress,
} from "@/lib/user-wallet";
import type { UserWallet } from "@/lib/user-wallet";

const EXAMPLE_JOB = "research 10 competitors and write a one-page brief";

const AGENTS = [
  { blurb: "Takes the job, breaks it into steps, and sets the total budget.", role: "Summoner" },
  { blurb: "Researches the job and gathers real sources.", role: "Seeker" },
  { blurb: "Writes the one-page brief from the sources found.", role: "Weaver" },
  { blurb: "Holds the ledger — reserves budget before any payment.", role: "Keeper" },
  { blurb: "Verifies each step, revokes a failing agent, stops bad payments.", role: "Warden" },
] as const;

/**
 * Public v1 home. The judge path is unchanged and stays the hero:
 * the same Summon form, the same $5.00 example job, no login, and the
 * ?job=<id> deep link still opens a job. Below it, the page now
 * explains Coven for a first-time public visitor — what it does, who
 * the agents are, how the ledger works — and links to Jobs history.
 */
export default function Home() {
  const [job, setJob] = useState(EXAMPLE_JOB);
  const [budget, setBudget] = useState("5.00");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summoning, setSummoning] = useState(false);
  const [userWallet, setUserWallet] = useState<UserWallet | null>(null);

  // Deep link: ?job=<id> opens an existing job, as before.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    if (id) setJobId(id);
  }, []);

  const summon = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSummoning(true);
      try {
        const cents = Math.round(Number.parseFloat(budget) * 100);
        if (userWallet) {
          // Per-user wallet: check the balance first, then sign the 4
          // handoff authorizations in the browser. A low balance fails
          // here, honestly, and never falls back to the demo wallet.
          const balance = await getUserWalletBalanceCents(userWallet.address);
          if (!balanceCoversBudget(balance, cents)) {
            throw new Error(
              `Insufficient test USDC: your wallet holds $${((balance ?? 0) / 100).toFixed(2)} but this job needs $${(cents / 100).toFixed(2)}. Fund it at faucet.circle.com (USDC, Base Sepolia) and try again.`,
            );
          }
          const request = await buildUserJobRequest({
            budgetCents: cents,
            job,
            wallet: userWallet,
          });
          const { jobId: id } = await summonCoven(request);
          rememberMyJob(id);
          setJobId(id);
          window.history.replaceState(null, "", `?job=${id}`);
          return;
        }
        const { jobId: id } = await summonCoven({ budgetCents: cents, job });
        rememberMyJob(id);
        setJobId(id);
        window.history.replaceState(null, "", `?job=${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not summon a coven");
      } finally {
        setSummoning(false);
      }
    },
    [budget, job, userWallet],
  );

  function reset() {
    setJobId(null);
    setError(null);
    window.history.replaceState(null, "", "/");
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          KIROWEEN 2026 · FRANKENSTEIN
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Summon a <span className="text-[#f5c518]">Coven</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a9ab0]">
          A Kiro Crew of AI agents that does a job together. Each agent has a
          scoped budget and pays the next agent per task with x402. Every
          payment is recorded in an audit ledger a judge can verify in 30
          seconds.
        </p>

        {error ? (
          <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
            {error}
          </p>
        ) : null}

        {jobId ? (
          <JobView jobId={jobId} onSummonAnother={reset} />
        ) : (
          <>
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
                className="mt-2 w-full rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-[#f8f7ff] outline-none focus:border-[#7c3aed]"
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
                {userWallet ? (
                  <>
                    Paying from <strong className="text-[#f8f7ff]">your wallet {shortAddress(userWallet.address)}</strong> —
                    this job settles from it, not the demo wallet.
                  </>
                ) : (
                  <>
                    Paying from the <strong className="text-[#f8f7ff]">demo wallet</strong> (shared test wallet).
                    Create your own wallet below to fund jobs yourself.
                  </>
                )}
              </p>
            </form>

            <UserWalletCard onWalletChange={setUserWallet} />

            <p className="mt-6 text-center text-sm text-[#9a9ab0]">
              Already summoned one?{" "}
              <Link href="/jobs" className="font-semibold text-[#a78bfa] underline">
                See recent jobs
              </Link>{" "}
              — every job has a shareable link anyone can audit.
            </p>

            <section className="mt-16">
              <h2 className="text-2xl font-bold text-[#f8f7ff]">How it works</h2>
              <ol className="mt-6 space-y-4">
                {[
                  ["1. Describe the job", "One job, one budget. For example: “research 10 AI note-taking apps and write a one-page brief”."],
                  ["2. The Coven does it", "Five specialist agents split the work. Each one has a scoped budget and pays the next agent per task with x402 — real USDC on Base Sepolia testnet."],
                  ["3. The ledger proves it", "Every reservation and payment is recorded in PostgreSQL. Settled + reserved + unresolved = approved budget, always. Click any payment to see its onchain hash."],
                ].map(([title, body]) => (
                  <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="font-bold text-[#f8f7ff]">{title}</p>
                    <p className="mt-1 text-[#9a9ab0]">{body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-16">
              <h2 className="text-2xl font-bold text-[#f8f7ff]">Meet the Coven</h2>
              <p className="mt-2 text-[#9a9ab0]">
                Five Kiro Crew agents. No agent can spend more than its budget,
                and no payment happens twice.
              </p>
              <div className="mt-6 space-y-4">
                {AGENTS.map(({ blurb, role }) => (
                  <article key={role} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#7c3aed]">
                      {role}
                    </p>
                    <p className="mt-1 text-[#9a9ab0]">{blurb}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-16">
              <h2 className="text-2xl font-bold text-[#f8f7ff]">How the ledger works</h2>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Settled", "Paid onchain, with a hash.", "#22c55e"],
                  ["Reserved", "Held for an agent, not yet paid.", "#f59e0b"],
                  ["Unresolved", "Outcome unknown — never shown as settled.", "#f59e0b"],
                  ["Approved", "The budget you set for the job.", "#f8f7ff"],
                ].map(([label, body, color]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold" style={{ color }}>{label}</p>
                    <p className="mt-1 text-sm text-[#9a9ab0]">{body}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-[#9a9ab0]">
                If an agent fails verification, the Warden revokes it and its
                reserved budget returns to the job.
              </p>
            </section>

            <section className="mt-16 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
              <h2 className="text-2xl font-bold text-[#f8f7ff]">Honest limits — public v1</h2>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-[#9a9ab0]">
                <li>Test USDC on Base Sepolia only — the money has no real value yet.</li>
                <li>One job type for now: a research brief, sourced from Wikipedia. Give the job a topic for a sharp brief.</li>
                <li>Budget $1.00–$10.00, crew of 5 agents.</li>
                <li>No accounts yet. Jobs you summon are remembered on this device, and anyone with a job link can view that job.</li>
                <li>Your wallet, if you create one, lives only in this browser. Its key never leaves your device — Coven&apos;s server only ever sees your signed payment authorizations. Each job pays your wallet to itself (a self-transfer), so your test USDC is not spent.</li>
              </ul>
              <p className="mt-4 text-sm text-[#9a9ab0]">
                Accounts and more job types are next — after the Kiroween
                submission on December 4.
              </p>
            </section>
          </>
        )}

        <footer className="mt-10 text-sm text-[#9a9ab0]">
          Settled + reserved + unresolved = approved budget. Always. ·{" "}
          <Link href="/jobs" className="text-[#a78bfa] underline">Jobs</Link>
        </footer>
      </main>
    </>
  );
}

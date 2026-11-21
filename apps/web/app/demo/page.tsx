"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteNav from "../components/SiteNav";
import { summonCoven } from "@/lib/job-state";

/**
 * Demo mode — the fast path for judges and first-time visitors.
 * No sign-in, no wallet: the job runs on the shared demo wallet
 * and is clearly labelled as a demo job in the ledger. The job
 * input starts EMPTY — the example is only a grey placeholder.
 * For real jobs paid from your own wallet, sign in instead.
 */
const JOB_PLACEHOLDER = "research 10 competitors and write a one-page brief";

export default function DemoPage() {
  const router = useRouter();
  const [job, setJob] = useState("");
  const [budget, setBudget] = useState("5.00");
  const [error, setError] = useState<string | null>(null);
  const [summoning, setSummoning] = useState(false);

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
        const { jobId } = await summonCoven({ budgetCents: cents, job: trimmed });
        router.push(`/workspace/jobs/${jobId}/agents`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not summon a coven");
      } finally {
        setSummoning(false);
      }
    },
    [budget, job, router],
  );

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · DEMO MODE
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Try the <span className="text-[#f5c518]">demo</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a9ab0]">
          No sign-in, no wallet. Describe a job, set a budget, and watch
          five agents do it — paid from the shared demo wallet, labelled
          as a demo job in the ledger.
        </p>
        <p className="mt-3 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-3 text-sm text-[#f8f7ff]">
          Demo jobs are paid by the shared test wallet, so their payments
          may show unresolved when the demo wallet is not funded. For jobs
          that settle from your own wallet,{" "}
          <Link href="/signin" className="font-semibold text-[#a78bfa] underline">
            sign in
          </Link>{" "}
          instead.
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
            {summoning ? "Summoning…" : "Summon a Coven — demo"}
          </button>
          <p className="mt-3 text-center text-sm text-[#9a9ab0]">
            Demo wallet · Budget $1.00–$10.00, test USDC on Base Sepolia.
          </p>
        </form>

        <p className="mt-8 text-center text-sm text-[#9a9ab0]">
          Want your own account, your own wallet, and your own job history?{" "}
          <Link href="/signin" className="font-semibold text-[#a78bfa] underline">
            Sign in with your wallet
          </Link>
        </p>
      </main>
    </>
  );
}

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { summonCoven } from "@/lib/job-state";
import {
  balanceCoversBudget,
  buildUserJobRequest,
  getUsdcBalanceCents,
  shortAddress,
} from "@/lib/injected-wallet";

/**
 * Summon a Coven from the dashboard. Signed-in only: the job is
 * paid from the account's own connected wallet, never the demo
 * wallet. The job input starts EMPTY — the example is only a grey
 * placeholder, never a prefilled value. Budget defaults to $5.00.
 */
const JOB_PLACEHOLDER = "research 10 competitors and write a one-page brief";

export default function SummonForm({ address }: { address: string }) {
  const router = useRouter();
  const { isConnected } = useAccount();
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
      if (!isConnected) {
        setError("Connect your wallet extension first — it signs the job's payments.");
        return;
      }
      setSummoning(true);
      try {
        const cents = Math.round(Number.parseFloat(budget) * 100);
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
        const { jobId } = await summonCoven(request);
        router.push(`/app/jobs/${jobId}/agents`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not summon a coven");
      } finally {
        setSummoning(false);
      }
    },
    [address, budget, isConnected, job, router],
  );

  return (
    <form
      onSubmit={summon}
      className="mt-6 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6"
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
      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-sm text-[#f8f7ff]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={summoning}
        className="mt-6 w-full rounded-lg bg-[#f5c518] px-6 py-4 text-lg font-bold text-black hover:brightness-110 disabled:opacity-50"
      >
        {summoning ? "Summoning…" : "Summon a Coven"}
      </button>
      <p className="mt-3 text-center text-sm text-[#9a9ab0]">
        Paying from your wallet {shortAddress(address)} — this job settles
        from it, not the demo wallet. Budget $1.00–$10.00, test USDC on
        Base Sepolia.
      </p>
    </form>
  );
}

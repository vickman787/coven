"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import type { PaymentPayload } from "@coven/payments";
import { summonCoven } from "@/lib/job-state";
import {
  HANDOFF_SIGNATURE_COUNT,
  HandoffSigningError,
  balanceCoversBudget,
  buildUserJobRequest,
  getUsdcBalanceCents,
  shortAddress,
} from "@/lib/injected-wallet";
import type { SigningProgress } from "@/lib/injected-wallet";

/**
 * Summon a Coven from the dashboard. Signed-in only: the job is
 * paid from the account's own connected wallet, never the demo
 * wallet. The job input starts EMPTY — the example is only a grey
 * placeholder, never a prefilled value. Budget defaults to $5.00.
 *
 * Signing: the wallet is asked for one EIP-3009 signature per
 * agent handoff (4 in total), one popup after another — mobile
 * wallet browsers in particular show each one separately, and any
 * single missed or declined popup used to fail the whole summon
 * with a generic error and no way back. The form now shows live
 * progress ("Approve signature 2 of 4…") and, when one signature
 * fails, names it and offers to resume from it instead of signing
 * all 4 again. A resume reuses the job and budget the signatures
 * were made for, so the inputs stay locked until the signing is
 * finished or restarted.
 */
const JOB_PLACEHOLDER = "research 10 competitors and write a one-page brief";

interface SigningFailure {
  failedIndex: number;
  message: string;
  total: number;
}

export default function SummonForm({ address }: { address: string }) {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [job, setJob] = useState("");
  const [budget, setBudget] = useState("5.00");
  const [error, setError] = useState<string | null>(null);
  const [summoning, setSummoning] = useState(false);
  const [signing, setSigning] = useState<SigningProgress | null>(null);
  const [signingFailed, setSigningFailed] = useState<SigningFailure | null>(null);
  /** Job + budget the current signing run is for — resumes reuse these. */
  const pendingRef = useRef<{ budgetCents: number; job: string } | null>(null);
  /** Signatures collected before a failure — the resume continues from these. */
  const resumeRef = useRef<PaymentPayload[]>([]);

  const attemptSummon = useCallback(
    async (resumeFrom: PaymentPayload[]) => {
      const pending =
        resumeFrom.length > 0 && pendingRef.current
          ? pendingRef.current
          : { budgetCents: Math.round(Number.parseFloat(budget) * 100), job: job.trim() };
      pendingRef.current = pending;
      resumeRef.current = resumeFrom;
      setError(null);
      setSigningFailed(null);
      setSummoning(true);
      setSigning({ done: resumeFrom.length, total: HANDOFF_SIGNATURE_COUNT });
      try {
        if (resumeFrom.length === 0) {
          const balance = await getUsdcBalanceCents(address);
          if (!balanceCoversBudget(balance, pending.budgetCents)) {
            throw new Error(
              `Insufficient test USDC: your wallet holds $${((balance ?? 0) / 100).toFixed(2)} but this job needs $${(pending.budgetCents / 100).toFixed(2)}. Fund it at faucet.circle.com (USDC, Base Sepolia) and try again.`,
            );
          }
        }
        const request = await buildUserJobRequest({
          address,
          budgetCents: pending.budgetCents,
          job: pending.job,
          onProgress: (progress) => setSigning(progress),
          resumeFrom,
        });
        setSigning(null);
        const { jobId } = await summonCoven(request);
        router.push(`/app/jobs/${jobId}/agents`);
      } catch (err) {
        setSigning(null);
        if (err instanceof HandoffSigningError) {
          resumeRef.current = err.signedAuthorizations;
          setSigningFailed({
            failedIndex: err.failedIndex,
            message: err.message,
            total: err.total,
          });
        } else {
          setError(err instanceof Error ? err.message : "Could not summon a coven");
        }
      } finally {
        setSummoning(false);
      }
    },
    [address, budget, job, router],
  );

  const summon = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (job.trim().length < 3) {
        setError("Describe the job first — a few words is enough.");
        return;
      }
      if (!isConnected) {
        setError("Connect your wallet extension first — it signs the job's payments.");
        return;
      }
      void attemptSummon([]);
    },
    [attemptSummon, isConnected, job],
  );

  const resumeSigning = useCallback(() => {
    void attemptSummon(resumeRef.current);
  }, [attemptSummon]);

  const startOver = useCallback(() => {
    pendingRef.current = null;
    resumeRef.current = [];
    setSigningFailed(null);
    setError(null);
    void attemptSummon([]);
  }, [attemptSummon]);

  const inputsLocked = summoning || signingFailed !== null;
  const nextSignature = signing ? signing.done + 1 : 1;

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
        disabled={inputsLocked}
        placeholder={JOB_PLACEHOLDER}
        className="mt-2 w-full rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-[#f8f7ff] outline-none placeholder:text-[#9a9ab0]/60 focus:border-[#7c3aed] disabled:opacity-60"
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
        disabled={inputsLocked}
        className="mt-2 w-full rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-[#f8f7ff] outline-none focus:border-[#7c3aed] disabled:opacity-60"
      />
      {signing ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-3 text-sm text-[#f8f7ff]"
        >
          <p className="font-semibold">
            Approve signature {nextSignature} of {signing.total} in your wallet
            {nextSignature === signing.total
              ? " — this is the last one."
              : ` — ${signing.total - nextSignature} more after this one.`}
          </p>
          <div className="mt-3 flex gap-1" aria-label={`${signing.done} of ${signing.total} signatures done`}>
            {Array.from({ length: signing.total }, (_, i) => (
              <span
                key={i}
                className={`h-2 flex-1 rounded-full ${i < signing.done ? "bg-[#f5c518]" : "bg-white/15"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-[#9a9ab0]">
            Your wallet will ask {signing.total} times in a row, one per agent — approve each one.
            If one is missed, you can resume from it instead of starting over.
          </p>
        </div>
      ) : null}
      {signingFailed ? (
        <div role="alert" className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-sm text-[#f8f7ff]">
          <p className="font-semibold">{signingFailed.message}</p>
          <p className="mt-1 text-[#9a9ab0]">
            {signingFailed.failedIndex} of {signingFailed.total} signatures are done — the ones
            already approved still count. Resume to sign the rest, or start over.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={resumeSigning}
              className="rounded-lg bg-[#f5c518] px-4 py-2 font-bold text-black hover:brightness-110"
            >
              Resume signing
            </button>
            <button
              type="button"
              onClick={startOver}
              className="rounded-lg border border-white/25 px-4 py-2 font-semibold text-[#f8f7ff] hover:border-[#f8f7ff]"
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-sm text-[#f8f7ff]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={summoning || signingFailed !== null}
        className="mt-6 w-full rounded-lg bg-[#f5c518] px-6 py-4 text-lg font-bold text-black hover:brightness-110 disabled:opacity-50"
      >
        {signing
          ? `Signing ${signing.done} of ${signing.total}…`
          : summoning
            ? "Summoning…"
            : "Summon a Coven"}
      </button>
      <p className="mt-3 text-center text-sm text-[#9a9ab0]">
        Paying from your wallet {shortAddress(address)} — this job settles
        from it, not the demo wallet. Budget $1.00–$10.00, test USDC on
        Base Sepolia.
      </p>
    </form>
  );
}

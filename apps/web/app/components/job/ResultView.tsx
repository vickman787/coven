"use client";

import { useState } from "react";
import Link from "next/link";
import { dollars, useJobState } from "@/lib/job-state";
import { renderBrief } from "@/lib/markdown";

/**
 * The Result — its own space, not a tab. The finished one-page
 * brief, its sources, and the final ledger balanced.
 */
export default function ResultView({ jobId }: { jobId: string }) {
  const { error, state } = useJobState(jobId);
  const [notice, setNotice] = useState<string | null>(null);

  if (!state) {
    return <p className="mt-8 text-[#9a9ab0]">{error ?? "Loading the job…"}</p>;
  }

  const totals = state.totals;

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-[#f8f7ff]">The Result</h2>
      {state.brief ? (
        <article className="mt-4 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
          {renderBrief(state.brief.markdown)}
        </article>
      ) : state.job.status === "failed" ? (
        <p className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
          The job failed — the Seeker found no sources, or the Warden
          rejected the brief. The ledger below shows where the money went.
        </p>
      ) : (
        <p className="mt-4 text-[#9a9ab0]">
          The brief is not ready yet — the Coven is still working. Check
          back in a few seconds.
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-6 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-4 text-[#f8f7ff]">
          {notice}
        </p>
      ) : null}
      <p className="mt-6 text-sm text-[#9a9ab0]">
        Final ledger: settled {dollars(totals.settledCents)} · reserved{" "}
        {dollars(totals.reservedCents)} · unresolved{" "}
        {dollars(totals.unresolvedCents)} · approved{" "}
        {dollars(totals.approvedBudgetCents)}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            const url = `${window.location.origin}/workspace/jobs/${jobId}`;
            void navigator.clipboard?.writeText(url);
            setNotice("Link copied — share it and anyone can audit this job.");
          }}
          className="flex-1 rounded-lg border border-[#7c3aed] px-6 py-3 font-bold text-[#a78bfa]"
        >
          Share this job
        </button>
        <Link
          href="/workspace"
          className="flex-1 rounded-lg bg-[#f5c518] px-6 py-3 text-center font-bold text-black hover:brightness-110"
        >
          Summon another Coven
        </Link>
      </div>
    </section>
  );
}

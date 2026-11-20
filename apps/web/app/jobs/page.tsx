"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteNav from "../components/SiteNav";
import { dollars, readMyJobs } from "@/lib/job-state";

interface JobListItem {
  approvedBudgetCents: number;
  createdAt?: string;
  description: string;
  id: string;
  payerAddress?: string;
  paymentMode?: "demo" | "user";
  reservedCents: number;
  settledCents: number;
  spentCents: number;
  status: string;
  unresolvedCents: number;
}

/**
 * Public Jobs history (v1, no accounts): every recent job in the ledger,
 * newest first. Jobs this browser summoned are marked "yours on this
 * device" from localStorage; any job link is shareable and viewable.
 */
export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myJobs, setMyJobs] = useState<string[]>([]);

  useEffect(() => {
    setMyJobs(readMyJobs());
    fetch("/api/jobs")
      .then(async (res) => {
        if (!res.ok) throw new Error("could not load jobs");
        const data = (await res.json()) as { jobs: JobListItem[] };
        setJobs(data.jobs);
      })
      .catch(() => setError("Could not load jobs. Try again in a moment."));
  }, []);

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · PUBLIC HISTORY
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Recent <span className="text-[#f5c518]">Jobs</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a9ab0]">
          Every job anyone has summoned, newest first. Open one to see its
          agents, its ledger, and its brief — no login needed.
        </p>

        {error ? (
          <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
            {error}
          </p>
        ) : null}

        {jobs === null && !error ? (
          <p className="mt-8 text-[#9a9ab0]">Loading jobs…</p>
        ) : jobs?.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
            <p className="text-[#f8f7ff]">No jobs yet.</p>
            <p className="mt-1 text-[#9a9ab0]">
              Be the first to summon a Coven.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-[#f5c518] px-6 py-3 font-bold text-black hover:brightness-110"
            >
              Summon a Coven
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {jobs?.map((job) => (
              <li key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <Link href={`/jobs/${job.id}`} className="block">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-bold text-[#f8f7ff]">{job.description}</p>
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-xs font-semibold text-[#9a9ab0]">
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#9a9ab0]">
                    Budget {dollars(job.approvedBudgetCents)} · Spent{" "}
                    {dollars(job.spentCents)} · Settled{" "}
                    {dollars(job.settledCents)} · Unresolved{" "}
                    {dollars(job.unresolvedCents)}
                    {job.createdAt
                      ? ` · ${new Date(job.createdAt).toLocaleString()}`
                      : ""}
                  </p>
                  {myJobs.includes(job.id) ? (
                    <p className="mt-2 text-xs font-semibold text-[#f5c518]">
                      Yours on this device
                    </p>
                  ) : null}
                  {job.paymentMode === "user" && job.payerAddress ? (
                    <p className="mt-1 text-xs text-[#9a9ab0]">
                      Paid from the user&apos;s own wallet{" "}
                      <span className="font-mono">{job.payerAddress.slice(0, 6)}…{job.payerAddress.slice(-4)}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[#9a9ab0]">Paid from the demo wallet</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-10 text-sm text-[#9a9ab0]">
          Jobs are public by link in v1 — anyone with a job link can view
          it. Accounts arrive after the Kiroween submission.
        </footer>
      </main>
    </>
  );
}

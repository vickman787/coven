"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import SiteNav from "../../components/SiteNav";
import { dollars, readMyJobs } from "@/lib/job-state";
import { shortAddress } from "@/lib/injected-wallet";

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

type Filter = "all" | "mine" | "demo";

/**
 * Work History — its own space. Real jobs from the ledger only,
 * newest first; nothing here is seeded or faked. When a wallet is
 * connected, "Mine" shows only jobs that wallet paid for; "Demo"
 * shows jobs from the shared demo wallet. Anyone with a job link
 * can open that job.
 */
export default function HistoryPage() {
  const { address, isConnected } = useAccount();
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myJobs, setMyJobs] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

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

  const shown = useMemo(() => {
    if (!jobs) return null;
    if (filter === "mine") {
      return jobs.filter(
        (j) =>
          myJobs.includes(j.id) ||
          (isConnected &&
            address &&
            j.payerAddress?.toLowerCase() === address.toLowerCase()),
      );
    }
    if (filter === "demo") return jobs.filter((j) => j.paymentMode !== "user");
    return jobs;
  }, [address, filter, isConnected, jobs, myJobs]);

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · WORK HISTORY
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Work <span className="text-[#f5c518]">History</span>
        </h1>
        <p className="mt-4 text-lg text-[#9a9ab0]">
          Every job summoned, newest first. Open one to see its agents, its
          ledger, and its brief — no login needed.
        </p>

        <div className="mt-6 flex gap-2">
          {(
            [
              ["all", "All jobs"],
              ["mine", "My jobs"],
              ["demo", "Demo jobs"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                filter === key
                  ? "border-[#f5c518] bg-[#f5c518] text-black"
                  : "border-white/15 text-[#f8f7ff] hover:border-[#7c3aed]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
            {error}
          </p>
        ) : null}

        {shown === null && !error ? (
          <p className="mt-8 text-[#9a9ab0]">Loading jobs…</p>
        ) : shown?.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
            <p className="text-[#f8f7ff]">No jobs yet.</p>
            <p className="mt-1 text-[#9a9ab0]">
              {filter === "mine"
                ? "No jobs from your wallet yet — summon one in the workspace."
                : "Be the first to summon a Coven."}
            </p>
            <Link
              href="/workspace"
              className="mt-4 inline-block rounded-lg bg-[#f5c518] px-6 py-3 font-bold text-black hover:brightness-110"
            >
              Summon a Coven
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {shown?.map((job) => (
              <li key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <Link href={`/workspace/jobs/${job.id}/agents`} className="block">
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
                      Paid from{" "}
                      <span className="font-mono">{shortAddress(job.payerAddress)}</span>
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
          Jobs are public by link — anyone with a job link can view it.
          Accounts arrive after the Kiroween submission.
        </footer>
      </main>
    </>
  );
}

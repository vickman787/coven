"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteNav from "../../components/SiteNav";
import AgentsView from "../../components/job/AgentsView";

interface JobListItem {
  description: string;
  id: string;
  status: string;
}

/**
 * Agents at Work — the dedicated space for watching agents work.
 * Shows the most recent job that is still running (or, if none is
 * running, the most recent job at all). Nothing here is seeded: with
 * no jobs, the empty state is real.
 */
export default function AgentsSpacePage() {
  const [job, setJob] = useState<JobListItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs?limit=50")
      .then(async (res) => {
        if (!res.ok) throw new Error("could not load jobs");
        const data = (await res.json()) as { jobs: JobListItem[] };
        const active = data.jobs.find(
          (j) => j.status === "running" || j.status === "created",
        );
        setJob(active ?? data.jobs[0] ?? null);
        setLoaded(true);
      })
      .catch(() => {
        setError("Could not load jobs. Try again in a moment.");
        setLoaded(true);
      });
  }, []);

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
          COVEN · AGENTS AT WORK
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-tight text-[#f8f7ff]">
          Agents at <span className="text-[#f5c518]">Work</span>
        </h1>

        {error ? (
          <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
            {error}
          </p>
        ) : null}

        {!loaded ? (
          <p className="mt-8 text-[#9a9ab0]">Loading…</p>
        ) : !job ? (
          <div className="mt-8 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
            <p className="text-[#f8f7ff]">No job running.</p>
            <p className="mt-1 text-[#9a9ab0]">
              Summon a Coven and its agents will work here, live.
            </p>
            <Link
              href="/workspace"
              className="mt-4 inline-block rounded-lg bg-[#f5c518] px-6 py-3 font-bold text-black hover:brightness-110"
            >
              Summon a Coven
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[#9a9ab0]">
              {job.description} ·{" "}
              <Link href={`/workspace/jobs/${job.id}/agents`} className="text-[#a78bfa] underline">
                Open this job
              </Link>
              {" · "}
              <Link href={`/workspace/jobs/${job.id}/ledger`} className="text-[#a78bfa] underline">
                Ledger
              </Link>
              {" · "}
              <Link href={`/workspace/jobs/${job.id}/result`} className="text-[#a78bfa] underline">
                Result
              </Link>
            </p>
            <AgentsView jobId={job.id} />
          </>
        )}
      </main>
    </>
  );
}

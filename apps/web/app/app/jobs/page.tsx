import Link from "next/link";
import { getLedger } from "@/lib/coven";
import { getSessionAccount } from "@/lib/auth";
import { dollars } from "@/lib/money";

type StatusFilter = "all" | "running" | "done" | "failed";

const FILTERS: [StatusFilter, string][] = [
  ["all", "All jobs"],
  ["running", "Running"],
  ["done", "Done"],
  ["failed", "Failed"],
];

/**
 * Jobs — the signed-in account's jobs, newest first, with a status
 * filter. Only this account's jobs are ever listed here; the
 * public history is the demo jobs, visible by link.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const account = await getSessionAccount();
  if (!account) return null; // The app layout redirects when signed out.
  const params = await searchParams;
  const filter: StatusFilter =
    params.status === "running" ||
    params.status === "done" ||
    params.status === "failed"
      ? params.status
      : "all";
  const ledger = await getLedger();
  const jobs = await ledger.listJobs(50, account.address);
  const withTotals = await Promise.all(
    jobs.map(async (job) => {
      const totals = await ledger.getTotals(job.id);
      return {
        ...job,
        ...totals,
        spentCents: totals.settledCents + totals.unresolvedCents,
      };
    }),
  );
  const shown =
    filter === "all"
      ? withTotals
      : withTotals.filter((j) =>
          filter === "running"
            ? j.status === "running" || j.status === "created"
            : j.status === filter,
        );

  return (
    <>
      <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
        COVEN · JOBS
      </p>
      <h1 className="mt-4 text-4xl font-bold leading-tight text-[#f8f7ff]">
        Your <span className="text-[#f5c518]">Jobs</span>
      </h1>
      <p className="mt-2 text-[#9a9ab0]">
        Every job your wallet summoned, newest first. Open one to see its
        agents, its ledger, and its brief.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "all" ? "/app/jobs" : `/app/jobs?status=${key}`}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              filter === key
                ? "border-[#f5c518] bg-[#f5c518] text-black"
                : "border-white/15 text-[#f8f7ff] hover:border-[#7c3aed]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
          <p className="text-[#f8f7ff]">No jobs here yet.</p>
          <p className="mt-1 text-[#9a9ab0]">
            {filter === "all"
              ? "Summon your first Coven from the dashboard — it will show up here."
              : `No ${filter} jobs — try another filter, or summon a new Coven.`}
          </p>
          <Link
            href="/app"
            className="mt-4 inline-block rounded-lg bg-[#f5c518] px-6 py-3 font-bold text-black hover:brightness-110"
          >
            Go to the dashboard
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {shown.map((job) => (
            <li key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <Link href={`/app/jobs/${job.id}/agents`} className="block">
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
                  {job.createdAt ? ` · ${new Date(job.createdAt).toLocaleString()}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import Link from "next/link";
import SummonForm from "./components/SummonForm";
import WalletBalance from "./components/WalletBalance";
import { getLedger } from "@/lib/coven";
import { displayNameOf, getSessionAccount } from "@/lib/auth";
import { dollars } from "@/lib/money";

/**
 * Dashboard: the account at a glance — test USDC balance, job
 * counts by status, money settled against money approved, recent
 * jobs, and the summon form. Everything here is real ledger data
 * for the signed-in account; with no jobs, the empty states are real.
 */
export default async function DashboardPage() {
  const account = await getSessionAccount();
  if (!account) return null; // The app layout redirects when signed out.
  const ledger = await getLedger();
  const [stats, recent] = await Promise.all([
    ledger.getAccountDashboard(account.address),
    ledger.listJobs(5, account.address),
  ]);
  const recentJobs = await Promise.all(
    recent.map(async (job) => {
      const totals = await ledger.getTotals(job.id);
      return { ...job, ...totals };
    }),
  );

  return (
    <>
      <p className="text-sm font-semibold tracking-[0.25em] text-[#7c3aed]">
        COVEN · DASHBOARD
      </p>
      <h1 className="mt-4 text-4xl font-bold leading-tight text-[#f8f7ff]">
        Welcome back, <span className="text-[#f5c518]">{displayNameOf(account)}</span>
      </h1>
      <p className="mt-2 text-[#9a9ab0]">
        Your Coven, your jobs, your wallet — all in one place.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">
            Test USDC balance
          </p>
          <WalletBalance address={account.address} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">Jobs</p>
          <p className="mt-1 text-2xl font-bold text-[#f8f7ff]">{stats.totalJobs}</p>
          <p className="mt-1 text-sm text-[#9a9ab0]">
            {stats.doneJobs} done · {stats.runningJobs} running · {stats.failedJobs} failed
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">Settled</p>
          <p className="mt-1 text-2xl font-bold text-[#22c55e]">{dollars(stats.totalSettledCents)}</p>
          <p className="mt-1 text-sm text-[#9a9ab0]">paid onchain, with hashes</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">Approved</p>
          <p className="mt-1 text-2xl font-bold text-[#f8f7ff]">{dollars(stats.totalApprovedCents)}</p>
          <p className="mt-1 text-sm text-[#9a9ab0]">budgeted across all jobs</p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-[#f8f7ff]">Summon a Coven</h2>
        <SummonForm address={account.address} />
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">Recent jobs</h2>
          <Link href="/app/jobs" className="text-sm font-semibold text-[#a78bfa] underline">
            All jobs
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
            <p className="text-[#f8f7ff]">No jobs yet.</p>
            <p className="mt-1 text-[#9a9ab0]">
              Summon your first Coven above — it will show up here.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {recentJobs.map((job) => (
              <li key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <Link href={`/app/jobs/${job.id}/agents`} className="block">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-bold text-[#f8f7ff]">{job.description}</p>
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-xs font-semibold text-[#9a9ab0]">
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#9a9ab0]">
                    Budget {dollars(job.approvedBudgetCents)} · Settled{" "}
                    {dollars(job.settledCents)} · Unresolved{" "}
                    {dollars(job.unresolvedCents)}
                    {job.createdAt ? ` · ${new Date(job.createdAt).toLocaleString()}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

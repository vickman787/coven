import { NextResponse } from "next/server";
import { getLedger } from "@/lib/coven";
import { getSessionAccountFromRequest } from "@/lib/auth";

/**
 * GET /api/dashboard — the signed-in account's dashboard: job
 * counts by status, money totals, and the 5 most recent jobs with
 * totals. Signed-out requests get a 401; the dashboard is the
 * account's own data, never anyone else's.
 */
export async function GET(request: Request) {
  const account = await getSessionAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }
  const ledger = await getLedger();
  const [stats, recent] = await Promise.all([
    ledger.getAccountDashboard(account.address),
    ledger.listJobs(5, account.address),
  ]);
  const recentJobs = await Promise.all(
    recent.map(async (job) => {
      const totals = await ledger.getTotals(job.id);
      return {
        ...job,
        ...totals,
        spentCents: totals.settledCents + totals.unresolvedCents,
      };
    }),
  );
  return NextResponse.json({
    address: account.address,
    displayName: account.displayName,
    recentJobs,
    stats,
  });
}

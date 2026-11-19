import { NextResponse } from "next/server";
import { getLedger } from "@/lib/coven";
import type { AgentRole } from "@coven/shared";

const AGENTS: AgentRole[] = ["summoner", "seeker", "weaver", "keeper", "warden"];

/** Read a job's live state: status, totals, payments, brief, revocations. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ledger = await getLedger();
  const job = await ledger.getJob(id);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  const [totals, payments, reservations, brief] = await Promise.all([
    ledger.getTotals(id),
    ledger.listPayments(id),
    ledger.listReservations(id),
    ledger.getBrief(id),
  ]);
  const revoked: AgentRole[] = [];
  for (const agent of AGENTS) {
    if (await ledger.isRevoked(id, agent)) revoked.push(agent);
  }
  return NextResponse.json({
    brief,
    job,
    payments,
    reservations,
    revoked,
    totals,
  });
}

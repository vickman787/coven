import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedger } from "@/lib/coven";
import { agentRoleSchema } from "@coven/shared";

const revokeSchema = z.object({ agent: agentRoleSchema });

/** Warden flow: revoke an agent. Its reserved budget is released. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "agent must be a valid agent role" }, { status: 400 });
  }
  const ledger = await getLedger();
  const job = await ledger.getJob(id);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  await ledger.revokeAgent(id, parsed.data.agent);
  const totals = await ledger.getTotals(id);
  return NextResponse.json({ revoked: parsed.data.agent, totals });
}

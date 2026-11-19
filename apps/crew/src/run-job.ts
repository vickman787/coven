import type { PostgresLedger } from "@coven/ledger";
import type { AgentRole } from "@coven/shared";
import {
  seekerResearch,
  summonerAllocate,
  wardenVerify,
  weaverWriteBrief,
} from "./agents.js";
import type {
  JobRunResult,
  PaymentExecutor,
  ResearchProvider,
} from "./types.js";

export interface RunJobOptions {
  budgetCents: number;
  executor: PaymentExecutor;
  jobDescription: string;
  jobId: string;
  ledger: PostgresLedger;
  provider: ResearchProvider;
}

/**
 * Run one job end to end: job in, brief out, ledger balanced.
 *
 * Money flow per handoff (Keeper's job):
 *   reserve -> work -> payFromReservation (unresolved) -> x402 pay ->
 *   confirm (settled + tx hash) or leave unresolved with the reason.
 * A payment is only ever settled when the x402 executor says it settled.
 */
export async function runJob(opts: RunJobOptions): Promise<JobRunResult> {
  const { ledger, executor, provider } = opts;
  await ledger.createJob({
    approvedBudgetCents: opts.budgetCents,
    description: opts.jobDescription,
    id: opts.jobId,
  });

  // Summoner: allocate the budget. Keeper: reserve each agent's share.
  const allocations = summonerAllocate(opts.budgetCents);
  for (const { agent, amountCents } of allocations) {
    await ledger.reserve({
      agentRole: agent,
      amountCents,
      idempotencyKey: `res-${opts.jobId}-${agent}`,
      jobId: opts.jobId,
    });
  }

  // Seeker: research. No sources means the job fails honestly.
  const sources = await seekerResearch(provider, opts.jobDescription);
  if (sources.length === 0) {
    await ledger.revokeAgent(opts.jobId, "seeker");
    const totals = await ledger.getTotals(opts.jobId);
    return {
      brief: null,
      jobId: opts.jobId,
      payments: [],
      status: "failed",
      totals,
    };
  }

  // Weaver: write the brief from the sources.
  const brief = weaverWriteBrief(opts.jobDescription, sources);

  // Warden: verify before any payment settles.
  const totalsBeforePay = await ledger.getTotals(opts.jobId);
  const verdict = wardenVerify({ brief, totals: totalsBeforePay });
  if (!verdict.ok) {
    await ledger.revokeAgent(opts.jobId, "weaver");
    const totals = await ledger.getTotals(opts.jobId);
    return {
      brief: null,
      jobId: opts.jobId,
      payments: [],
      status: "failed",
      totals,
    };
  }

  // Pay each handoff via x402, in order. Handoffs are derived from the
  // Summoner's allocations, so any budget splits correctly.
  const byAgent = new Map(allocations.map((a) => [a.agent, a.amountCents]));
  const handoffs: { amountCents: number; fromAgent: AgentRole; toAgent: AgentRole }[] = [
    { amountCents: byAgent.get("seeker")!, fromAgent: "summoner", toAgent: "seeker" },
    { amountCents: byAgent.get("weaver")!, fromAgent: "seeker", toAgent: "weaver" },
    { amountCents: byAgent.get("keeper")!, fromAgent: "weaver", toAgent: "keeper" },
    { amountCents: byAgent.get("warden")!, fromAgent: "keeper", toAgent: "warden" },
  ];
  const payments: JobRunResult["payments"] = [];
  for (const handoff of handoffs) {
    const paymentKey = `pay-${opts.jobId}-${handoff.fromAgent}-${handoff.toAgent}`;
    const reservationKey = `res-${opts.jobId}-${handoff.toAgent}`;
    const payment = await ledger.payFromReservation({
      fromAgent: handoff.fromAgent,
      jobId: opts.jobId,
      paymentIdempotencyKey: paymentKey,
      reservationIdempotencyKey: reservationKey,
      toAgent: handoff.toAgent,
    });
    let result: { reason?: string; status: "settled" | "unresolved"; txHash?: string };
    try {
      result = await executor.pay({
        amountCents: handoff.amountCents,
        description: `${handoff.fromAgent} pays ${handoff.toAgent} for job ${opts.jobId}`,
      });
    } catch (err) {
      result = {
        reason: err instanceof Error ? err.message : "executor threw",
        status: "unresolved",
      };
    }
    if (result.status === "settled" && result.txHash) {
      const confirmed = await ledger.confirmPayment({
        idempotencyKey: paymentKey,
        jobId: opts.jobId,
        x402Hash: result.txHash,
      });
      payments.push({
        amountCents: confirmed.amountCents,
        fromAgent: handoff.fromAgent,
        status: confirmed.status,
        toAgent: handoff.toAgent,
        txHash: confirmed.x402Hash,
      });
    } else {
      payments.push({
        amountCents: payment.amountCents,
        fromAgent: handoff.fromAgent,
        reason: result.reason ?? "unresolved",
        status: payment.status,
        toAgent: handoff.toAgent,
        ...(result.txHash ? { txHash: result.txHash } : {}),
      });
    }
  }

  const totals = await ledger.getTotals(opts.jobId);
  return { brief, jobId: opts.jobId, payments, status: "done", totals };
}

export type { AgentRole };

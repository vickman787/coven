"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentRole } from "@coven/shared";
import { agentStatus } from "@/lib/agent-status";
import { dollars, revokeAgent, useJobState } from "@/lib/job-state";
import { statusBadge } from "./statusBadge";

const AGENTS: { role: AgentRole; blurb: string }[] = [
  { blurb: "Takes the job and splits the budget", role: "summoner" },
  { blurb: "Researches and gathers sources", role: "seeker" },
  { blurb: "Writes the one-page brief", role: "weaver" },
  { blurb: "Holds the ledger and pays", role: "keeper" },
  { blurb: "Verifies each step, revokes failures", role: "warden" },
];

/**
 * Agents at Work — its own space, not a tab. The 5 agent cards with
 * live status, scoped budget, and amount spent, plus the progress
 * bar and revoke. An agent is "paid" only when its payment settled
 * WITH an x402 hash; a finished agent with an unresolved payment is
 * "complete" — never shown as paid.
 */
export default function AgentsView({
  base = "/workspace/jobs",
  jobId,
}: {
  base?: string;
  jobId: string;
}) {
  const { error, reload, state } = useJobState(jobId);
  const [confirmRevoke, setConfirmRevoke] = useState<AgentRole | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function onRevoke(agent: AgentRole) {
    setConfirmRevoke(null);
    try {
      await revokeAgent(jobId, agent);
      await reload();
    } catch {
      setRevokeError("Could not revoke that agent");
    }
  }

  if (!state) {
    return <p className="mt-8 text-[#9a9ab0]">{error ?? "Loading the job…"}</p>;
  }

  const totals = state.totals;
  // Money accounted for so far: settled + unresolved. It is NOT all
  // "spent" — an unresolved payment has not moved yet.
  const accounted = totals.settledCents + totals.unresolvedCents;
  const progress = Math.min(100, (accounted / totals.approvedBudgetCents) * 100);

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-[#f8f7ff]">The Coven at Work</h2>
        {statusBadge(state.job.status)}
      </div>
      <p className="mt-2 text-[#9a9ab0]">{state.job.description}</p>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#7c3aed] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-[#9a9ab0]">
        {dollars(accounted)} of {dollars(state.job.approvedBudgetCents)} accounted for (
        {dollars(totals.settledCents)} settled · {dollars(totals.unresolvedCents)}{" "}
        unresolved)
        {state.job.status === "running" || state.job.status === "created"
          ? " — the Coven is working, this page updates live"
          : ""}
      </p>

      {error || revokeError ? (
        <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
          {error ?? revokeError}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {AGENTS.map(({ role, blurb }) => {
          const { amountCents, label, paymentStatus } = agentStatus(state, role);
          const reservation = state.reservations.find((r) => r.agentRole === role);
          return (
            <article
              key={role}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#7c3aed]">
                    {role}
                  </p>
                  <p className="mt-1 text-[#9a9ab0]">{blurb}</p>
                </div>
                {statusBadge(label)}
              </div>
              <p className="mt-3 text-sm text-[#f8f7ff]">
                Budget {reservation ? dollars(reservation.amountCents) : "—"} ·{" "}
                {label === "paid"
                  ? `Spent ${dollars(amountCents)}`
                  : label === "complete"
                    ? `Payment ${paymentStatus ?? "unresolved"} — ${dollars(amountCents)} approved, not settled`
                    : `Spent ${dollars(label === "working" ? 0 : amountCents)}`}
              </p>
              {role !== "summoner" && label !== "revoked" && label !== "paid" ? (
                confirmRevoke === role ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void onRevoke(role)}
                      className="rounded-lg bg-[#ef4444] px-4 py-2 text-sm font-bold text-white"
                    >
                      Yes, revoke {role}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(null)}
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-[#f8f7ff]"
                    >
                      Keep them
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(role)}
                    className="mt-3 rounded-lg border border-[#ef4444]/50 px-4 py-2 text-sm font-semibold text-[#ef4444]"
                  >
                    Revoke {role}
                  </button>
                )
              ) : null}
            </article>
          );
        })}
      </div>
      {state.job.status === "done" ? (
        <Link
          href={`${base}/${jobId}/result`}
          className="mt-6 block w-full rounded-lg bg-[#f5c518] px-6 py-4 text-center text-lg font-bold text-black hover:brightness-110"
        >
          See the Result
        </Link>
      ) : null}
    </section>
  );
}

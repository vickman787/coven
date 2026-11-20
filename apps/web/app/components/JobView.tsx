"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRole } from "@coven/shared";
import { agentStatus } from "@/lib/agent-status";
import {
  dollars,
  EXPLORER_TX,
  fetchJobState,
  revokeAgent,
} from "@/lib/job-state";
import type { JobState } from "@/lib/job-state";
import { renderBrief } from "@/lib/markdown";

const AGENTS: { role: AgentRole; blurb: string }[] = [
  { blurb: "Takes the job and splits the budget", role: "summoner" },
  { blurb: "Researches and gathers sources", role: "seeker" },
  { blurb: "Writes the one-page brief", role: "weaver" },
  { blurb: "Holds the ledger and pays", role: "keeper" },
  { blurb: "Verifies each step, revokes failures", role: "warden" },
];

const STATUS_STYLE: Record<string, string> = {
  complete: "bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/40",
  done: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  failed: "bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40",
  paid: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  reserved: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40",
  revoked: "bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40",
  running: "bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/40",
  settled: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  unresolved: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40",
};

function statusBadge(status: string) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-white/10 text-[#9a9ab0]"}`}
    >
      {status}
    </span>
  );
}

export type JobScreen = "work" | "ledger" | "result";

/**
 * The Coven at Work / Ledger / Result tabs for one job. Shared by the
 * home page (?job=<id> deep link) and the clean route /jobs/[id], so a
 * job has one view wherever it is opened from.
 */
export default function JobView({
  initialScreen = "work",
  jobId,
  onSummonAnother,
}: {
  initialScreen?: JobScreen;
  jobId: string;
  onSummonAnother?: () => void;
}) {
  const [state, setState] = useState<JobState | null>(null);
  const [screen, setScreen] = useState<JobScreen>(initialScreen);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<AgentRole | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (id: string) => {
    try {
      const next = await fetchJobState(id);
      setState(next);
      return next;
    } catch {
      setError("Lost connection to the job. Retrying…");
      return null;
    }
  }, []);

  useEffect(() => {
    void load(jobId);
  }, [jobId, load]);

  // Poll while the job is running.
  useEffect(() => {
    if (!state) return;
    const active = state.job.status === "created" || state.job.status === "running";
    if (!active) return;
    pollRef.current = setInterval(() => void load(jobId), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, state?.job.status, load]);

  async function onRevoke(agent: AgentRole) {
    setConfirmRevoke(null);
    try {
      await revokeAgent(jobId, agent);
      await load(jobId);
    } catch {
      setError("Could not revoke that agent");
    }
  }

  const totals = state?.totals;
  // Money accounted for so far: settled + unresolved. It is NOT all
  // "spent" — an unresolved payment has not moved yet.
  const accounted = totals ? totals.settledCents + totals.unresolvedCents : 0;
  const progress = totals
    ? Math.min(100, (accounted / totals.approvedBudgetCents) * 100)
    : 0;

  if (!state) {
    return (
      <p className="mt-8 text-[#9a9ab0]">
        {error ?? "Loading the job…"}
      </p>
    );
  }

  return (
    <div>
      <nav className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ["work", "The Coven at Work"],
            ["ledger", "The Ledger"],
            ["result", "The Result"],
          ] as [JobScreen, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScreen(key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              screen === key
                ? "border-[#f5c518] bg-[#f5c518] text-black"
                : "border-white/15 text-[#f8f7ff] hover:border-[#7c3aed]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-6 rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 p-4 text-[#f8f7ff]">
          {notice}
        </p>
      ) : null}

      {screen === "work" ? (
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
            {dollars(accounted)} of {dollars(state.job.approvedBudgetCents)} accounted for
            {" "}({dollars(totals?.settledCents ?? 0)} settled ·{" "}
            {dollars(totals?.unresolvedCents ?? 0)} unresolved)
            {state.job.status === "running" || state.job.status === "created"
              ? " — the Coven is working, this page updates live"
              : ""}
          </p>
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
            <button
              type="button"
              onClick={() => setScreen("result")}
              className="mt-6 w-full rounded-lg bg-[#f5c518] px-6 py-4 text-lg font-bold text-black hover:brightness-110"
            >
              See the Result
            </button>
          ) : null}
        </section>
      ) : null}

      {screen === "ledger" ? (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">The Ledger</h2>
          {totals ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Settled", totals.settledCents, "#22c55e"],
                  ["Reserved", totals.reservedCents, "#f59e0b"],
                  ["Unresolved", totals.unresolvedCents, "#f59e0b"],
                  ["Approved", totals.approvedBudgetCents, "#f8f7ff"],
                ].map(([label, cents, color]) => (
                  <div key={label as string} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9ab0]">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold" style={{ color: color as string }}>
                      {dollars(cents as number)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-[#9a9ab0]">
                Settled + reserved + unresolved = approved budget.{" "}
                {dollars(totals.settledCents)} + {dollars(totals.reservedCents)} +{" "}
                {dollars(totals.unresolvedCents)} = {dollars(totals.approvedBudgetCents)}.{" "}
                An unresolved payment is never shown as settled.
              </p>
              <p className="mt-2 text-sm text-[#9a9ab0]">
                {state.job.paymentMode === "user" && state.job.payerAddress ? (
                  <>
                    Paid from the user&apos;s own wallet{" "}
                    <span className="font-mono text-[#f8f7ff]">{state.job.payerAddress}</span>{" "}
                    (per-user wallet — the server never held its key).
                  </>
                ) : (
                  <>Paid from the demo wallet (the shared test wallet).</>
                )}
              </p>
            </>
          ) : null}
          <h3 className="mt-8 text-lg font-bold text-[#f8f7ff]">Payments</h3>
          {state.payments.length === 0 ? (
            <p className="mt-2 text-[#9a9ab0]">No payments yet — the Coven is still working.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {state.payments.map((p) => (
                <li key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedHash(expandedHash === p.id ? null : p.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                  >
                    <span className="text-[#f8f7ff]">
                      {p.fromAgent} → {p.toAgent} ·{" "}
                      <strong>{dollars(p.amountCents)}</strong>
                    </span>
                    {statusBadge(p.status)}
                  </button>
                  {expandedHash === p.id ? (
                    <div className="mt-3 break-all text-sm text-[#9a9ab0]">
                      <p>Payment: {p.idempotencyKey}</p>
                      <p className="mt-1">
                        x402 hash: {p.x402Hash ?? "none yet — unresolved payments have no hash"}
                      </p>
                      {p.x402Hash ? (
                        <a
                          href={EXPLORER_TX(p.x402Hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[#7c3aed] underline"
                        >
                          View on Blockscout (Base Sepolia)
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {state.revoked.length > 0 ? (
            <p className="mt-6 text-sm text-[#ef4444]">
              Revoked: {state.revoked.join(", ")} — their reserved budget was released.
            </p>
          ) : null}
        </section>
      ) : null}

      {screen === "result" ? (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#f8f7ff]">The Result</h2>
          {state.brief ? (
            <article className="mt-4 rounded-2xl border border-[#7c3aed]/40 bg-white/[0.03] p-6">
              {renderBrief(state.brief.markdown)}
            </article>
          ) : state.job.status === "failed" ? (
            <p className="mt-4 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
              The job failed — the Seeker found no sources, or the Warden
              rejected the brief. The ledger below shows where the money went.
            </p>
          ) : (
            <p className="mt-4 text-[#9a9ab0]">
              The brief is not ready yet — the Coven is still working. Check
              back in a few seconds.
            </p>
          )}
          {totals ? (
            <p className="mt-6 text-sm text-[#9a9ab0]">
              Final ledger: settled {dollars(totals.settledCents)} · reserved{" "}
              {dollars(totals.reservedCents)} · unresolved{" "}
              {dollars(totals.unresolvedCents)} · approved{" "}
              {dollars(totals.approvedBudgetCents)}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/jobs/${jobId}`;
                void navigator.clipboard?.writeText(url);
                setNotice("Link copied — share it and anyone can audit this job.");
              }}
              className="flex-1 rounded-lg border border-[#7c3aed] px-6 py-3 font-bold text-[#a78bfa]"
            >
              Share this job
            </button>
            {onSummonAnother ? (
              <button
                type="button"
                onClick={onSummonAnother}
                className="flex-1 rounded-lg bg-[#f5c518] px-6 py-3 font-bold text-black hover:brightness-110"
              >
                Summon another Coven
              </button>
            ) : (
              <a
                href="/"
                className="flex-1 rounded-lg bg-[#f5c518] px-6 py-3 text-center font-bold text-black hover:brightness-110"
              >
                Summon another Coven
              </a>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

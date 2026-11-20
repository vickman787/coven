"use client";

import { useState } from "react";
import { dollars, EXPLORER_TX, useJobState } from "@/lib/job-state";

/**
 * The Ledger — its own space, not a tab. Top totals, the rule in
 * plain text, who paid, and the list of payments with x402 hashes.
 * An unresolved payment is never shown as settled.
 */
export default function LedgerView({ jobId }: { jobId: string }) {
  const { error, state } = useJobState(jobId);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  if (!state) {
    return <p className="mt-8 text-[#9a9ab0]">{error ?? "Loading the job…"}</p>;
  }

  const totals = state.totals;

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-[#f8f7ff]">The Ledger</h2>
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
            (your browser wallet extension — the server never held its key).
          </>
        ) : (
          <>Paid from the demo wallet (the shared test wallet).</>
        )}
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-4 text-[#f8f7ff]">
          {error}
        </p>
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
                  {p.fromAgent} → {p.toAgent} · <strong>{dollars(p.amountCents)}</strong>
                </span>
                <span className="text-xs font-semibold text-[#9a9ab0]">{p.status}</span>
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
  );
}

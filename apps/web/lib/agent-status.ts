import type { AgentRole } from "@coven/shared";
import type { JobState } from "./job-state";

/**
 * What an agent card shows on The Coven at Work.
 *
 * This is the fix for the contradiction found on the live site on
 * 2026-11-20: the Work tab labelled agents "paid" while the Ledger showed
 * $0 settled / $5.00 unresolved with no hash. An agent is "paid" ONLY
 * when its payment is settled with an x402 hash. A finished agent whose
 * payment is unresolved is "complete" — its work is done, the money has
 * NOT moved yet. Never show an unresolved payment as settled.
 */
export interface AgentDisplay {
  /** Scoped budget for this agent, in cents (0 when none reserved). */
  amountCents: number;
  label: "allocated" | "complete" | "paid" | "revoked" | "waiting" | "working";
  /** The payment status behind the label, when a payment exists. */
  paymentStatus?: "failed" | "reserved" | "revoked" | "settled" | "unresolved";
}

export function agentStatus(state: JobState, role: AgentRole): AgentDisplay {
  if (state.revoked.includes(role)) {
    return { amountCents: 0, label: "revoked" };
  }
  const reservation = state.reservations.find((r) => r.agentRole === role);
  const payment = state.payments.find((p) => p.toAgent === role);
  if (role === "summoner") {
    return state.reservations.length > 0
      ? { amountCents: 0, label: "allocated" }
      : { amountCents: 0, label: "waiting" };
  }
  if (payment) {
    if (payment.status === "settled" && payment.x402Hash) {
      return {
        amountCents: payment.amountCents,
        label: "paid",
        paymentStatus: "settled",
      };
    }
    // Work done, money not moved (yet): complete, never "paid".
    return {
      amountCents: payment.amountCents,
      label: "complete",
      paymentStatus: payment.status,
    };
  }
  if (reservation) {
    return { amountCents: reservation.amountCents, label: "working" };
  }
  return { amountCents: 0, label: "waiting" };
}

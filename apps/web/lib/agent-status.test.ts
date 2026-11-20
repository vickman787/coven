import { describe, expect, it } from "vitest";
import { agentStatus } from "./agent-status";
import type { JobState } from "./job-state";

function state(overrides: Partial<JobState> = {}): JobState {
  return {
    brief: null,
    job: {
      approvedBudgetCents: 500,
      description: "research 10 competitors and write a one-page brief",
      id: "job-test",
      status: "done",
    },
    payments: [],
    reservations: [],
    revoked: [],
    totals: {
      approvedBudgetCents: 500,
      reservedCents: 0,
      settledCents: 0,
      unresolvedCents: 0,
    },
    ...overrides,
  };
}

describe("agentStatus — paid means settled with a hash, nothing else", () => {
  it("labels a settled payment with a hash as paid", () => {
    const s = state({
      payments: [
        {
          amountCents: 200,
          fromAgent: "summoner",
          id: "pay-1",
          idempotencyKey: "pay-1",
          jobId: "job-test",
          status: "settled",
          toAgent: "seeker",
          x402Hash: "0xabc",
        },
      ],
      totals: {
        approvedBudgetCents: 500,
        reservedCents: 0,
        settledCents: 200,
        unresolvedCents: 0,
      },
    });
    expect(agentStatus(s, "seeker")).toEqual({
      amountCents: 200,
      label: "paid",
      paymentStatus: "settled",
    });
  });

  it("labels an unresolved payment as complete, never paid (live-site bug, 2026-11-20)", () => {
    const s = state({
      payments: [
        {
          amountCents: 200,
          fromAgent: "summoner",
          id: "pay-1",
          idempotencyKey: "pay-1",
          jobId: "job-test",
          status: "unresolved",
          toAgent: "seeker",
        },
      ],
      totals: {
        approvedBudgetCents: 500,
        reservedCents: 0,
        settledCents: 0,
        unresolvedCents: 200,
      },
    });
    const result = agentStatus(s, "seeker");
    expect(result.label).toBe("complete");
    expect(result.label).not.toBe("paid");
    expect(result.paymentStatus).toBe("unresolved");
    expect(result.amountCents).toBe(200);
  });

  it("does not call a settled payment without a hash paid", () => {
    const s = state({
      payments: [
        {
          amountCents: 200,
          fromAgent: "summoner",
          id: "pay-1",
          idempotencyKey: "pay-1",
          jobId: "job-test",
          status: "settled",
          toAgent: "seeker",
        },
      ],
    });
    expect(agentStatus(s, "seeker").label).toBe("complete");
  });

  it("labels a reserved agent working, a revoked agent revoked, and the summoner allocated", () => {
    const s = state({
      reservations: [
        {
          agentRole: "seeker",
          amountCents: 200,
          id: "res-1",
          idempotencyKey: "res-1",
          jobId: "job-test",
          status: "reserved",
        },
      ],
      revoked: ["warden"],
    });
    expect(agentStatus(s, "seeker")).toEqual({
      amountCents: 200,
      label: "working",
    });
    expect(agentStatus(s, "warden").label).toBe("revoked");
    expect(agentStatus(s, "summoner").label).toBe("allocated");
    expect(agentStatus(s, "weaver").label).toBe("waiting");
  });
});

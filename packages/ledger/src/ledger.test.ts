import { describe, expect, it } from "vitest";
import { createTestJob, createTestLedger, JOB_ID } from "./test-helpers.js";

describe("ledger invariant", () => {
  it("starts at zero and never exceeds the approved budget", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals).toEqual({
      approvedBudgetCents: 500,
      reservedCents: 0,
      settledCents: 0,
      unresolvedCents: 0,
    });
  });

  it("rejects a reservation that would exceed the budget", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await expect(
      ledger.reserve({
        agentRole: "seeker",
        amountCents: 600,
        idempotencyKey: "res-too-big",
        jobId: JOB_ID,
      }),
    ).rejects.toThrow(/insufficient budget/);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.reservedCents).toBe(0);
  });

  it("keeps the invariant after reserve, settle, and release", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-1",
      jobId: JOB_ID,
    });
    await ledger.reserve({
      agentRole: "weaver",
      amountCents: 200,
      idempotencyKey: "res-2",
      jobId: JOB_ID,
    });
    await ledger.settle({
      idempotencyKey: "res-1",
      jobId: JOB_ID,
      x402Hash: "0xabc",
    });
    let totals = await ledger.getTotals(JOB_ID);
    expect(totals.settledCents).toBe(200);
    expect(totals.reservedCents).toBe(200);
    expect(totals.settledCents + totals.reservedCents + totals.unresolvedCents).toBeLessThanOrEqual(500);
    await expect(
      ledger.reserve({
        agentRole: "seeker",
        amountCents: 200,
        idempotencyKey: "res-3",
        jobId: JOB_ID,
      }),
    ).rejects.toThrow(/insufficient budget/);
    totals = await ledger.getTotals(JOB_ID);
    expect(totals.settledCents + totals.reservedCents + totals.unresolvedCents).toBeLessThanOrEqual(500);
  });
});

describe("idempotency", () => {
  it("the same reservation twice returns the same reservation and reserves once", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    const first = await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-dup",
      jobId: JOB_ID,
    });
    const second = await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-dup",
      jobId: JOB_ID,
    });
    expect(second.id).toBe(first.id);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.reservedCents).toBe(200);
  });

  it("the same settle twice settles once and returns the same payment", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-settle-dup",
      jobId: JOB_ID,
    });
    const first = await ledger.settle({
      idempotencyKey: "res-settle-dup",
      jobId: JOB_ID,
      x402Hash: "0xabc",
    });
    const second = await ledger.settle({
      idempotencyKey: "res-settle-dup",
      jobId: JOB_ID,
      x402Hash: "0xabc",
    });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("settled");
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.settledCents).toBe(200);
    const payments = await ledger.listPayments(JOB_ID);
    expect(payments).toHaveLength(1);
  });
});

describe("atomic reservation race", () => {
  it("two agents racing for the last dollar: only one wins", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    const results = await Promise.allSettled([
      ledger.reserve({
        agentRole: "seeker",
        amountCents: 400,
        idempotencyKey: "race-1",
        jobId: JOB_ID,
      }),
      ledger.reserve({
        agentRole: "weaver",
        amountCents: 400,
        idempotencyKey: "race-2",
        jobId: JOB_ID,
      }),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.reservedCents).toBe(400);
    expect(totals.settledCents + totals.reservedCents + totals.unresolvedCents).toBeLessThanOrEqual(500);
  });

  it("many concurrent reservations never exceed the budget", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        ledger.reserve({
          agentRole: "seeker",
          amountCents: 100,
          idempotencyKey: `race-many-${i}`,
          jobId: JOB_ID,
        }),
      ),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    expect(won.length).toBeLessThanOrEqual(5);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.reservedCents).toBeLessThanOrEqual(500);
  });
});

describe("payFromReservation", () => {
  it("moves money from reserved to unresolved without double-counting", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-pay-1",
      jobId: JOB_ID,
    });
    const payment = await ledger.payFromReservation({
      fromAgent: "summoner",
      jobId: JOB_ID,
      paymentIdempotencyKey: "pay-from-res-1",
      reservationIdempotencyKey: "res-pay-1",
      toAgent: "seeker",
    });
    expect(payment.status).toBe("unresolved");
    expect(payment.amountCents).toBe(200);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.reservedCents).toBe(0);
    expect(totals.unresolvedCents).toBe(200);
    expect(totals.settledCents + totals.reservedCents + totals.unresolvedCents).toBe(200);
  });

  it("is idempotent: the same payment key twice returns the same payment", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-pay-2",
      jobId: JOB_ID,
    });
    const first = await ledger.payFromReservation({
      fromAgent: "summoner",
      jobId: JOB_ID,
      paymentIdempotencyKey: "pay-from-res-2",
      reservationIdempotencyKey: "res-pay-2",
      toAgent: "seeker",
    });
    const second = await ledger.payFromReservation({
      fromAgent: "summoner",
      jobId: JOB_ID,
      paymentIdempotencyKey: "pay-from-res-2",
      reservationIdempotencyKey: "res-pay-2",
      toAgent: "seeker",
    });
    expect(second.id).toBe(first.id);
    expect((await ledger.getTotals(JOB_ID)).unresolvedCents).toBe(200);
  });

  it("cannot pay twice from the same reservation", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-pay-3",
      jobId: JOB_ID,
    });
    await ledger.payFromReservation({
      fromAgent: "summoner",
      jobId: JOB_ID,
      paymentIdempotencyKey: "pay-from-res-3a",
      reservationIdempotencyKey: "res-pay-3",
      toAgent: "seeker",
    });
    await expect(
      ledger.payFromReservation({
        fromAgent: "summoner",
        jobId: JOB_ID,
        paymentIdempotencyKey: "pay-from-res-3b",
        reservationIdempotencyKey: "res-pay-3",
        toAgent: "seeker",
      }),
    ).rejects.toThrow(/cannot pay from reservation/);
  });
});

describe("revocation", () => {
  it("a revoked agent cannot spend, and its reserved budget is released", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-revoke",
      jobId: JOB_ID,
    });
    await ledger.revokeAgent(JOB_ID, "seeker");
    expect(await ledger.isRevoked(JOB_ID, "seeker")).toBe(true);
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.reservedCents).toBe(0);
    await expect(
      ledger.reserve({
        agentRole: "seeker",
        amountCents: 100,
        idempotencyKey: "res-after-revoke",
        jobId: JOB_ID,
      }),
    ).rejects.toThrow(/revoked/);
    // Another agent can still use the released budget.
    await ledger.reserve({
      agentRole: "weaver",
      amountCents: 200,
      idempotencyKey: "res-weaver-after",
      jobId: JOB_ID,
    });
    expect((await ledger.getTotals(JOB_ID)).reservedCents).toBe(200);
  });

  it("revoking an agent marks its unresolved payments as revoked, settled payments stay settled", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.createUnresolvedPayment({
      amountCents: 100,
      fromAgent: "seeker",
      idempotencyKey: "pay-unres-revoke",
      jobId: JOB_ID,
      toAgent: "weaver",
    });
    await ledger.revokeAgent(JOB_ID, "seeker");
    const payments = await ledger.listPayments(JOB_ID);
    expect(payments[0]?.status).toBe("revoked");
    expect((await ledger.getTotals(JOB_ID)).unresolvedCents).toBe(0);
  });
});

describe("reconciliation", () => {
  it("an uncertain payment stays unresolved until confirmed or released", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    const payment = await ledger.createUnresolvedPayment({
      amountCents: 150,
      fromAgent: "seeker",
      idempotencyKey: "pay-unres-1",
      jobId: JOB_ID,
      toAgent: "weaver",
    });
    expect(payment.status).toBe("unresolved");
    let totals = await ledger.getTotals(JOB_ID);
    expect(totals.unresolvedCents).toBe(150);
    expect(totals.settledCents).toBe(0);
    const confirmed = await ledger.confirmPayment({
      idempotencyKey: "pay-unres-1",
      jobId: JOB_ID,
      x402Hash: "0xdef",
    });
    expect(confirmed.status).toBe("settled");
    expect(confirmed.x402Hash).toBe("0xdef");
    totals = await ledger.getTotals(JOB_ID);
    expect(totals.unresolvedCents).toBe(0);
    expect(totals.settledCents).toBe(150);
  });

  it("releasing an unresolved payment frees its budget", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.createUnresolvedPayment({
      amountCents: 150,
      fromAgent: "seeker",
      idempotencyKey: "pay-unres-2",
      jobId: JOB_ID,
      toAgent: "weaver",
    });
    const released = await ledger.releasePayment({
      idempotencyKey: "pay-unres-2",
      jobId: JOB_ID,
    });
    expect(released.status).toBe("failed");
    const totals = await ledger.getTotals(JOB_ID);
    expect(totals.unresolvedCents).toBe(0);
    expect(totals.settledCents).toBe(0);
  });

  it("confirming a settled payment is idempotent", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    await ledger.createUnresolvedPayment({
      amountCents: 100,
      fromAgent: "seeker",
      idempotencyKey: "pay-unres-3",
      jobId: JOB_ID,
      toAgent: "weaver",
    });
    const first = await ledger.confirmPayment({
      idempotencyKey: "pay-unres-3",
      jobId: JOB_ID,
      x402Hash: "0x123",
    });
    const second = await ledger.confirmPayment({
      idempotencyKey: "pay-unres-3",
      jobId: JOB_ID,
      x402Hash: "0x123",
    });
    expect(second.id).toBe(first.id);
    expect((await ledger.getTotals(JOB_ID)).settledCents).toBe(100);
  });
});

describe("job status and briefs", () => {
  it("reads a job, moves it through statuses, and rejects unknown jobs", async () => {
    const ledger = await createTestLedger();
    expect(await ledger.getJob("missing")).toBeNull();
    await createTestJob(ledger, 500);
    const job = await ledger.getJob(JOB_ID);
    expect(job?.status).toBe("created");
    expect(job?.approvedBudgetCents).toBe(500);
    const running = await ledger.updateJobStatus(JOB_ID, "running");
    expect(running.status).toBe("running");
    const done = await ledger.updateJobStatus(JOB_ID, "done");
    expect(done.status).toBe("done");
    await expect(ledger.updateJobStatus("missing", "done")).rejects.toThrow(
      /job not found/,
    );
  });

  it("saves and reads back a brief, null before it exists", async () => {
    const ledger = await createTestLedger();
    await createTestJob(ledger, 500);
    expect(await ledger.getBrief(JOB_ID)).toBeNull();
    await ledger.saveBrief(JOB_ID, {
      markdown: "# Brief\nHello.",
      sources: [
        { snippet: "x", title: "Acme", url: "https://example.com/acme" },
      ],
    });
    const brief = await ledger.getBrief(JOB_ID);
    expect(brief?.markdown).toBe("# Brief\nHello.");
    expect(brief?.sources).toEqual([
      { snippet: "x", title: "Acme", url: "https://example.com/acme" },
    ]);
  });
});

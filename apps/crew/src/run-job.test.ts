import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { PostgresLedger } from "@coven/ledger";
import { runJob } from "./run-job.js";
import type { PaymentExecutor, ResearchProvider } from "./types.js";

async function testLedger(): Promise<PostgresLedger> {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const ledger = new PostgresLedger(new Pool() as never);
  await ledger.init();
  return ledger;
}

const mockProvider: ResearchProvider = {
  name: "mock",
  async search() {
    return [
      {
        snippet: "Acme builds agent wallets.",
        title: "Acme",
        url: "https://en.wikipedia.org/wiki/Acme",
      },
      {
        snippet: "Beta builds agent ledgers.",
        title: "Beta",
        url: "https://en.wikipedia.org/wiki/Beta",
      },
    ];
  },
};

const emptyProvider: ResearchProvider = {
  name: "empty",
  async search() {
    return [];
  },
};

const settledExecutor: PaymentExecutor = {
  async pay() {
    return { status: "settled", txHash: "0xsettled123" };
  },
};

const unresolvedExecutor: PaymentExecutor = {
  async pay() {
    return { reason: "insufficient_balance", status: "unresolved" };
  },
};

describe("runJob end to end", () => {
  it("job in, brief out, ledger balanced, all payments settled", async () => {
    const ledger = await testLedger();
    const result = await runJob({
      budgetCents: 500,
      executor: settledExecutor,
      jobDescription: "research 10 competitors and write a one-page brief",
      jobId: "job-e2e-settled",
      ledger,
      provider: mockProvider,
    });
    expect(result.status).toBe("done");
    expect(result.brief).not.toBeNull();
    expect(result.brief!.markdown).toContain("# Competitor Brief");
    expect(result.brief!.markdown).toContain("Acme");
    expect(result.brief!.sources).toHaveLength(2);
    expect(result.payments).toHaveLength(4);
    expect(result.payments.every((p) => p.status === "settled")).toBe(true);
    expect(result.payments.every((p) => p.txHash === "0xsettled123")).toBe(true);
    expect(result.totals.settledCents).toBe(500);
    expect(result.totals.reservedCents).toBe(0);
    expect(result.totals.unresolvedCents).toBe(0);
    expect(
      result.totals.settledCents + result.totals.reservedCents + result.totals.unresolvedCents,
    ).toBe(500);
  });

  it("unfunded wallet: job completes, payments stay unresolved, ledger still balances", async () => {
    const ledger = await testLedger();
    const result = await runJob({
      budgetCents: 500,
      executor: unresolvedExecutor,
      jobDescription: "research 10 competitors and write a one-page brief",
      jobId: "job-e2e-unresolved",
      ledger,
      provider: mockProvider,
    });
    expect(result.status).toBe("done");
    expect(result.brief).not.toBeNull();
    expect(result.payments).toHaveLength(4);
    expect(result.payments.every((p) => p.status === "unresolved")).toBe(true);
    expect(result.payments.every((p) => p.txHash === undefined)).toBe(true);
    expect(result.totals.unresolvedCents).toBe(500);
    expect(result.totals.settledCents).toBe(0);
    expect(
      result.totals.settledCents + result.totals.reservedCents + result.totals.unresolvedCents,
    ).toBe(500);
  });

  it("no sources: job fails honestly, seeker revoked, budget released", async () => {
    const ledger = await testLedger();
    const result = await runJob({
      budgetCents: 500,
      executor: settledExecutor,
      jobDescription: "research 10 competitors and write a one-page brief",
      jobId: "job-e2e-failed",
      ledger,
      provider: emptyProvider,
    });
    expect(result.status).toBe("failed");
    expect(result.brief).toBeNull();
    expect(result.payments).toHaveLength(0);
    expect(await ledger.isRevoked("job-e2e-failed", "seeker")).toBe(true);
    const totals = result.totals;
    expect(totals.settledCents + totals.reservedCents + totals.unresolvedCents).toBeLessThanOrEqual(500);
  });

  it("a throwing executor leaves payments unresolved, not settled", async () => {
    const ledger = await testLedger();
    const throwing: PaymentExecutor = {
      async pay() {
        throw new Error("facilitator unreachable");
      },
    };
    const result = await runJob({
      budgetCents: 500,
      executor: throwing,
      jobDescription: "research 10 competitors and write a one-page brief",
      jobId: "job-e2e-throwing",
      ledger,
      provider: mockProvider,
    });
    expect(result.status).toBe("done");
    expect(result.payments.every((p) => p.status === "unresolved")).toBe(true);
    expect(result.totals.settledCents).toBe(0);
  });
});

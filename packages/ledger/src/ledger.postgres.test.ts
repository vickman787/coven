import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PostgresLedger } from "./index.js";

// Runs only when DATABASE_URL is set, against a real PostgreSQL server.
// In this VM, PostgreSQL is installed via apt and the test database is
// created by the setup in docs/ledger.md. The pg-mem tests in
// ledger.test.ts are the default suite and run without a server.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("ledger against real PostgreSQL", () => {
  it("race for the last dollar: only one wins, on a real server", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL }) as never;
    const ledger = new PostgresLedger(pool);
    await ledger.init();
    const jobId = `job-real-${Date.now()}`;
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "real postgres race test",
      id: jobId,
    });
    const results = await Promise.allSettled([
      ledger.reserve({
        agentRole: "seeker",
        amountCents: 400,
        idempotencyKey: `real-race-1-${jobId}`,
        jobId,
      }),
      ledger.reserve({
        agentRole: "weaver",
        amountCents: 400,
        idempotencyKey: `real-race-2-${jobId}`,
        jobId,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const totals = await ledger.getTotals(jobId);
    expect(totals.reservedCents).toBe(400);
    expect(totals.settledCents + totals.reservedCents + totals.unresolvedCents).toBeLessThanOrEqual(500);
    await (pool as Pool).end();
  });
});

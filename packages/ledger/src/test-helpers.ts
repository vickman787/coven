import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresLedger } from "./index.js";

export async function createTestLedger(): Promise<PostgresLedger> {
  const db = newDb();
  // pg-mem adapter provides a pg-compatible Pool.
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as never;
  const ledger = new PostgresLedger(pool);
  await ledger.init();
  return ledger;
}

export function schemaSql(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, "schema.sql"), "utf-8");
}

export const JOB_ID = "job-test-1";
export const BUDGET_CENTS = 500; // $5.00

export async function createTestJob(
  ledger: PostgresLedger,
  approvedBudgetCents = BUDGET_CENTS,
) {
  return ledger.createJob({
    approvedBudgetCents,
    description: "research 10 competitors and write a one-page brief",
    id: JOB_ID,
  });
}

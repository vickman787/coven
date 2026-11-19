import { newDb } from "pg-mem";
import { PostgresLedger } from "@coven/ledger";
import { X402PaymentExecutor } from "@coven/payments";
import type { Hex } from "@coven/payments";
import { runJob } from "@coven/crew";
import { WikipediaProvider } from "@coven/crew";
import type { PaymentExecutor } from "@coven/crew";

/**
 * Server-side Coven wiring for the web app.
 *
 * Ledger: real Postgres when DATABASE_URL is set, otherwise pg-mem.
 * On the deployed app DATABASE_URL points at Railway Postgres, so the
 * ledger survives across serverless instances. pg-mem is only the local
 * demo fallback.
 *
 * Payments: real x402 when COVEN_PAYER_PRIVATE_KEY + COVEN_PAYEE_ADDRESS
 * are set, otherwise every payment is recorded unresolved with the
 * reason shown — never as settled.
 */

declare global {
  // eslint-disable-next-line no-var
  var __covenLedger: PostgresLedger | undefined;
  // eslint-disable-next-line no-var
  var __covenLedgerInit: Promise<void> | undefined;
}

export async function getLedger(): Promise<PostgresLedger> {
  if (!globalThis.__covenLedger) {
    if (process.env.DATABASE_URL) {
      globalThis.__covenLedger = PostgresLedger.fromEnv();
    } else {
      const db = newDb();
      const { Pool } = db.adapters.createPg();
      globalThis.__covenLedger = new PostgresLedger(new Pool() as never);
    }
    globalThis.__covenLedgerInit = globalThis.__covenLedger.init();
  }
  await globalThis.__covenLedgerInit;
  return globalThis.__covenLedger;
}

export function getExecutor(): PaymentExecutor {
  const payerKey = process.env.COVEN_PAYER_PRIVATE_KEY as Hex | undefined;
  const payee = process.env.COVEN_PAYEE_ADDRESS;
  if (payerKey && payee) {
    return new X402PaymentExecutor({
      facilitatorUrl: process.env.X402_FACILITATOR_URL,
      payTo: payee,
      payerPrivateKey: payerKey,
    });
  }
  return {
    async pay() {
      return { reason: "no payer wallet configured", status: "unresolved" as const };
    },
  };
}

/** Run a job to completion in the background, persisting its outcome. */
export async function runJobBackground(input: {
  budgetCents: number;
  jobDescription: string;
  jobId: string;
}): Promise<void> {
  const ledger = await getLedger();
  try {
    await ledger.updateJobStatus(input.jobId, "running");
    const result = await runJob({
      budgetCents: input.budgetCents,
      executor: getExecutor(),
      jobDescription: input.jobDescription,
      jobId: input.jobId,
      ledger,
      provider: new WikipediaProvider(),
    });
    if (result.brief) {
      await ledger.saveBrief(input.jobId, result.brief);
    }
    await ledger.updateJobStatus(
      input.jobId,
      result.status === "done" ? "done" : "failed",
    );
  } catch (err) {
    console.error(`job ${input.jobId} failed:`, err);
    try {
      await ledger.updateJobStatus(input.jobId, "failed");
    } catch {
      // Best effort: the job row may not exist if creation failed.
    }
  }
}

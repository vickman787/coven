import { newDb } from "pg-mem";
import { PostgresLedger } from "@coven/ledger";
import {
  getUsdcBalanceCents,
  PreSignedPaymentExecutor,
  X402PaymentExecutor,
} from "@coven/payments";
import type { Hex, PaymentPayload } from "@coven/payments";
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
 *
 * Per-user wallets (2026-11-20): a user-funded job arrives with
 * signed EIP-3009 authorizations, validated in the API route before
 * the job is created. They are kept ONLY in this process's memory
 * (never Postgres, never a log), handed to the background run, and
 * deleted as soon as the run finishes or fails. If the server
 * restarts between POST and the background run, the authorizations
 * are lost and the payments stay unresolved — never re-signed or
 * silently retried with the shared wallet.
 */

declare global {
  // eslint-disable-next-line no-var
  var __covenLedger: PostgresLedger | undefined;
  // eslint-disable-next-line no-var
  var __covenLedgerInit: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __covenUserAuthorizations: Map<string, PaymentPayload[]> | undefined;
}

function userAuthorizationsStore(): Map<string, PaymentPayload[]> {
  if (!globalThis.__covenUserAuthorizations) {
    globalThis.__covenUserAuthorizations = new Map();
  }
  return globalThis.__covenUserAuthorizations;
}

/** Hold signed authorizations for a job until its background run takes them. */
export function storeUserAuthorizations(jobId: string, payloads: PaymentPayload[]): void {
  userAuthorizationsStore().set(jobId, [...payloads]);
}

/** Take (and delete) a job's signed authorizations. Returns [] when none. */
export function takeUserAuthorizations(jobId: string): PaymentPayload[] {
  const store = userAuthorizationsStore();
  const payloads = store.get(jobId) ?? [];
  store.delete(jobId);
  return payloads;
}

/**
 * Best-effort balance pre-check for a user-funded job. Returns the
 * known balance in cents, or null when the RPC is unreachable — in
 * which case the facilitator is the final authority at settle time
 * and the job is not blocked here.
 */
export async function getUserWalletBalanceCents(
  address: string,
): Promise<number | null> {
  return getUsdcBalanceCents(address);
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

/** Executor for a user-funded job: settle only its signed authorizations. */
export function getUserExecutor(payloads: PaymentPayload[]): PaymentExecutor {
  return new PreSignedPaymentExecutor({
    facilitatorUrl: process.env.X402_FACILITATOR_URL,
    payloads,
  });
}

/** Run a job to completion in the background, persisting its outcome. */
export async function runJobBackground(input: {
  budgetCents: number;
  jobDescription: string;
  jobId: string;
  /** "user": settle from the job's signed authorizations, never the shared wallet. */
  paymentMode?: "demo" | "user";
}): Promise<void> {
  const ledger = await getLedger();
  // Take the authorizations now, so they are deleted even if the run throws.
  const authorizations =
    input.paymentMode === "user" ? takeUserAuthorizations(input.jobId) : [];
  try {
    await ledger.updateJobStatus(input.jobId, "running");
    const result = await runJob({
      budgetCents: input.budgetCents,
      executor:
        input.paymentMode === "user"
          ? getUserExecutor(authorizations)
          : getExecutor(),
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

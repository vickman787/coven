import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { PostgresLedger } from "@coven/ledger";
import { X402PaymentExecutor } from "@coven/payments";
import type { Hex } from "@coven/payments";
import { WikipediaProvider } from "./research.js";
import { runJob } from "./run-job.js";
import type { PaymentExecutor } from "./types.js";

/**
 * CLI: run one Coven job end to end.
 *
 *   pnpm --filter @coven/crew build
 *   pnpm --filter @coven/crew run-job [--job "..."] [--budget 500]
 *
 * Ledger: real Postgres when COVEN_USE_POSTGRES=1 and DATABASE_URL is set,
 * otherwise pg-mem (in-memory Postgres). The .env file always sets
 * DATABASE_URL for deployment, so the demo defaults to pg-mem unless
 * you explicitly opt into a real server.
 * Payments: real x402 when COVEN_PAYER_PRIVATE_KEY + COVEN_PAYEE_ADDRESS
 * are set (testnet wallet, fund via https://faucet.circle.com). Without
 * a wallet, payments are recorded unresolved with the reason shown —
 * never as settled.
 */

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
loadEnvFile(join(process.cwd(), ".env"));
loadEnvFile(join(here, "..", "..", "..", ".env"));

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

async function main(): Promise<void> {
  const jobDescription = arg(
    "--job",
    "research 10 competitors and write a one-page brief",
  );
  const budgetCents = Number.parseInt(arg("--budget", "500"), 10);
  const jobId = arg("--job-id", `job-${Date.now()}`);

  let ledger: PostgresLedger;
  if (process.env.COVEN_USE_POSTGRES === "1" && process.env.DATABASE_URL) {
    console.log("Ledger: real Postgres (DATABASE_URL).");
    ledger = PostgresLedger.fromEnv();
  } else {
    console.log("Ledger: pg-mem (in-memory Postgres). Set COVEN_USE_POSTGRES=1 to use a real server.");
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    ledger = new PostgresLedger(new Pool() as never);
  }
  await ledger.init();

  let executor: PaymentExecutor;
  const payerKey = process.env.COVEN_PAYER_PRIVATE_KEY as Hex | undefined;
  const payee = process.env.COVEN_PAYEE_ADDRESS;
  if (payerKey && payee) {
    executor = new X402PaymentExecutor({
      facilitatorUrl: process.env.X402_FACILITATOR_URL,
      payTo: payee,
      payerPrivateKey: payerKey,
    });
    console.log("Payments: real x402 via facilitator.");
  } else {
    console.log(
      "Payments: no testnet wallet configured — payments will be recorded unresolved (never settled). " +
        "Set COVEN_PAYER_PRIVATE_KEY + COVEN_PAYEE_ADDRESS in .env, fund the wallet at https://faucet.circle.com, and re-run.",
    );
    executor = {
      async pay() {
        return {
          reason: "no payer wallet configured",
          status: "unresolved" as const,
        };
      },
    };
  }

  const result = await runJob({
    budgetCents,
    executor,
    jobDescription,
    jobId,
    ledger,
    provider: new WikipediaProvider(),
  });

  console.log(`\nJob ${result.jobId}: ${result.status}`);
  console.log(
    `Ledger: settled $${(result.totals.settledCents / 100).toFixed(2)} + ` +
      `reserved $${(result.totals.reservedCents / 100).toFixed(2)} + ` +
      `unresolved $${(result.totals.unresolvedCents / 100).toFixed(2)} = ` +
      `approved $${(result.totals.approvedBudgetCents / 100).toFixed(2)}`,
  );
  for (const p of result.payments) {
    console.log(
      `  ${p.fromAgent} -> ${p.toAgent}: $${(p.amountCents / 100).toFixed(2)} ${p.status}` +
        (p.txHash ? ` hash ${p.txHash}` : "") +
        (p.reason ? ` (${p.reason})` : ""),
    );
  }
  if (result.brief) {
    const outDir = join(here, "..", "runs");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${jobId}.md`);
    writeFileSync(outPath, result.brief.markdown, "utf-8");
    console.log(`\nBrief saved to ${outPath}\n`);
    console.log(result.brief.markdown);
  } else {
    console.log("\nNo brief: the job failed (see ledger totals above).");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

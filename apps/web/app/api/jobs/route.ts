import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateUserAuthorizations } from "@coven/payments";
import type { PaymentPayload } from "@coven/payments";
import {
  getLedger,
  getUserWalletBalanceCents,
  runJobBackground,
  storeUserAuthorizations,
} from "@/lib/coven";

export const maxDuration = 300;

const authorizationSchema = z.object({
  accepted: z.object({
    amount: z.string(),
    asset: z.string(),
    extra: z.object({
      assetTransferMethod: z.literal("eip3009"),
      name: z.literal("USDC"),
      version: z.literal("2"),
    }),
    maxTimeoutSeconds: z.number(),
    network: z.string(),
    payTo: z.string(),
    scheme: z.literal("exact"),
  }),
  payload: z.object({
    authorization: z.object({
      from: z.string(),
      nonce: z.string(),
      to: z.string(),
      validAfter: z.string(),
      validBefore: z.string(),
      value: z.string(),
    }),
    signature: z.string(),
  }),
  x402Version: z.literal(2),
});

const createJobSchema = z.object({
  authorizations: z.array(authorizationSchema).optional(),
  budgetCents: z.number().int().min(100).max(1000),
  job: z.string().trim().min(3).max(500),
  payerAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
  paymentMode: z.enum(["demo", "user"]).optional(),
});

/** List recent jobs for the public Jobs page, newest first. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.max(1, Math.min(100, Number.isInteger(parsedLimit) ? parsedLimit : 50));
  const ledger = await getLedger();
  const jobs = await ledger.listJobs(limit);
  const items = await Promise.all(
    jobs.map(async (job) => {
      const totals = await ledger.getTotals(job.id);
      return {
        ...job,
        ...totals,
        // Spent in the UI means money accounted for (settled + unresolved);
        // the per-agent label still distinguishes settled from unresolved.
        spentCents: totals.settledCents + totals.unresolvedCents,
      };
    }),
  );
  return NextResponse.json({ jobs: items });
}

/**
 * Summon a Coven: create the job and run it in the background.
 *
 * Two modes, never mixed:
 * - demo (default, the judge path): the shared test wallet, as before.
 * - user: the job is paid from the user's own browser wallet. The
 *   request must carry 4 signed EIP-3009 authorizations (one per
 *   handoff, amounts = the budget split). They are validated here —
 *   signer, amounts, payee, nonce, validity window — and the wallet's
 *   test USDC balance is checked. Any failure is a 400 and NO job is
 *   created: a user job never silently falls back to the shared wallet.
 *   The private key is never in this request; only signed payloads.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "job must be 3-500 characters and budget $1.00-$10.00" },
      { status: 400 },
    );
  }
  const { budgetCents, job } = parsed.data;
  const paymentMode = parsed.data.paymentMode ?? "demo";

  let authorizations: PaymentPayload[] = [];
  if (paymentMode === "user") {
    const payerAddress = parsed.data.payerAddress;
    const supplied = parsed.data.authorizations ?? [];
    if (!payerAddress || supplied.length === 0) {
      return NextResponse.json(
        { error: "a user-funded job needs your wallet address and signed payment authorizations" },
        { status: 400 },
      );
    }
    const validation = await validateUserAuthorizations({
      authorizations: supplied as PaymentPayload[],
      budgetCents,
      payTo: payerAddress,
      payerAddress,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: `invalid payment authorizations: ${validation.reason}` },
        { status: 400 },
      );
    }
    // Balance gate: fund the wallet first. Unknown balance (RPC down)
    // does not block here — the facilitator will reject an unfunded
    // payment at verify time and the ledger shows it unresolved.
    const balance = await getUserWalletBalanceCents(payerAddress);
    if (balance !== null && balance < budgetCents) {
      return NextResponse.json(
        {
          error: `insufficient test USDC: your wallet holds $${(balance / 100).toFixed(2)} but the job needs $${(budgetCents / 100).toFixed(2)}. Fund it at https://faucet.circle.com (USDC, Base Sepolia) and try again.`,
        },
        { status: 400 },
      );
    }
    authorizations = supplied as PaymentPayload[];
  }

  const ledger = await getLedger();
  const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await ledger.createJob({
    approvedBudgetCents: budgetCents,
    description: job,
    id: jobId,
    ...(paymentMode === "user"
      ? { payerAddress: parsed.data.payerAddress!, paymentMode: "user" as const }
      : { paymentMode: "demo" as const }),
  });
  if (paymentMode === "user") {
    storeUserAuthorizations(jobId, authorizations);
  }
  // The job keeps running after this response, within the function's
  // max duration. The client polls GET /api/jobs/[id] for progress.
  // after() needs the Next request context; outside it (tests, other
  // runtimes) fall back to a plain background run.
  try {
    after(() =>
      runJobBackground({
        budgetCents,
        jobDescription: job,
        jobId,
        paymentMode,
      }),
    );
  } catch {
    void runJobBackground({
      budgetCents,
      jobDescription: job,
      jobId,
      paymentMode,
    });
  }
  return NextResponse.json({ jobId }, { status: 202 });
}

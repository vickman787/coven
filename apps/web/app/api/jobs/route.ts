import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedger, runJobBackground } from "@/lib/coven";

export const maxDuration = 300;

const createJobSchema = z.object({
  budgetCents: z.number().int().min(100).max(1000),
  job: z.string().trim().min(3).max(500),
});

/** Summon a Coven: create the job and run it in the background. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "job must be 3-500 characters and budget $1.00-$10.00" },
      { status: 400 },
    );
  }
  const ledger = await getLedger();
  const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await ledger.createJob({
    approvedBudgetCents: parsed.data.budgetCents,
    description: parsed.data.job,
    id: jobId,
  });
  // The job keeps running after this response, within the function's
  // max duration. The client polls GET /api/jobs/[id] for progress.
  // after() needs the Next request context; outside it (tests, other
  // runtimes) fall back to a plain background run.
  try {
    after(() =>
      runJobBackground({
        budgetCents: parsed.data.budgetCents,
        jobDescription: parsed.data.job,
        jobId,
      }),
    );
  } catch {
    void runJobBackground({
      budgetCents: parsed.data.budgetCents,
      jobDescription: parsed.data.job,
      jobId,
    });
  }
  return NextResponse.json({ jobId }, { status: 202 });
}

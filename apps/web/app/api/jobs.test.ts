import { describe, expect, it } from "vitest";
import { POST as createJob } from "./jobs/route.js";
import { GET as getJob } from "./jobs/[id]/route.js";
import { POST as revoke } from "./jobs/[id]/revoke/route.js";
import { getLedger } from "../../lib/coven.js";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/jobs", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/jobs", () => {
  it("rejects a bad budget and a job that is too short", async () => {
    const tooCheap = await createJob(postRequest({ budgetCents: 50, job: "research x" }));
    expect(tooCheap.status).toBe(400);
    const tooShort = await createJob(postRequest({ budgetCents: 500, job: "x" }));
    expect(tooShort.status).toBe(400);
  });

  it("creates a job and returns 202 with a jobId", async () => {
    const res = await createJob(
      postRequest({ budgetCents: 500, job: "research 10 competitors and write a one-page brief" }),
    );
    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string };
    expect(data.jobId).toMatch(/^job-/);
    const ledger = await getLedger();
    const job = await ledger.getJob(data.jobId);
    expect(job).not.toBeNull();
    expect(job?.approvedBudgetCents).toBe(500);
  });
});

describe("GET /api/jobs/[id]", () => {
  it("404s for an unknown job", async () => {
    const res = await getJob(new Request("http://localhost/api/jobs/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns totals, payments, and brief for a known job", async () => {
    const ledger = await getLedger();
    const job = await ledger.createJob({
      approvedBudgetCents: 500,
      description: "test job",
      id: "job-api-test",
    });
    expect(job.id).toBe("job-api-test");
    const res = await getJob(new Request("http://localhost/api/jobs/job-api-test"), {
      params: Promise.resolve({ id: "job-api-test" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      brief: unknown;
      totals: { approvedBudgetCents: number; settledCents: number };
    };
    expect(data.totals.approvedBudgetCents).toBe(500);
    expect(data.totals.settledCents).toBe(0);
    expect(data.brief).toBeNull();
  });
});

describe("POST /api/jobs/[id]/revoke", () => {
  it("rejects an invalid agent role", async () => {
    const res = await revoke(postRequest({ agent: "ghost" }), {
      params: Promise.resolve({ id: "job-api-test" }),
    });
    expect(res.status).toBe(400);
  });

  it("revokes an agent and releases its reserved budget", async () => {
    const ledger = await getLedger();
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "revoke test",
      id: "job-api-revoke",
    });
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-api-revoke",
      jobId: "job-api-revoke",
    });
    const res = await revoke(postRequest({ agent: "seeker" }), {
      params: Promise.resolve({ id: "job-api-revoke" }),
    });
    expect(res.status).toBe(200);
    expect(await ledger.isRevoked("job-api-revoke", "seeker")).toBe(true);
    const totals = await ledger.getTotals("job-api-revoke");
    expect(totals.reservedCents).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { GET as listJobs, POST as createJob } from "./jobs/route.js";
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

describe("GET /api/jobs", () => {
  it("lists recent jobs newest first, with totals and a date", async () => {
    const ledger = await getLedger();
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "list first job",
      id: "job-list-a",
    });
    await ledger.createJob({
      approvedBudgetCents: 300,
      description: "list second job",
      id: "job-list-b",
    });
    const res = await listJobs(new Request("http://localhost/api/jobs"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      jobs: {
        approvedBudgetCents: number;
        createdAt?: string;
        description: string;
        id: string;
        settledCents: number;
        spentCents: number;
        status: string;
        unresolvedCents: number;
      }[];
    };
    const mine = data.jobs.filter((j) => j.id.startsWith("job-list-"));
    expect(mine.map((j) => j.id)).toEqual(["job-list-b", "job-list-a"]);
    expect(mine[0]?.approvedBudgetCents).toBe(300);
    expect(mine[0]?.settledCents).toBe(0);
    expect(mine[0]?.unresolvedCents).toBe(0);
    expect(mine[0]?.spentCents).toBe(0);
    expect(mine[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("respects ?limit=1", async () => {
    const res = await listJobs(new Request("http://localhost/api/jobs?limit=1"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { jobs: unknown[] };
    expect(data.jobs).toHaveLength(1);
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

describe("POST /api/jobs — user-funded jobs", () => {
  it("rejects a user job with no signed authorizations, and creates no job", async () => {
    const res = await createJob(
      postRequest({
        budgetCents: 500,
        job: "research 10 competitors and write a one-page brief",
        payerAddress: "0x38c80359CD99245f2Fae9C284579A10Af7a41932",
        paymentMode: "user",
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/signed payment authorizations/);
  });

  it("rejects tampered authorizations", async () => {
    const { generateUserWallet, signUserHandoffAuthorizations } = await import(
      "@coven/payments/user-wallet"
    );
    const wallet = generateUserWallet();
    const { authorizations } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
    const tampered = authorizations.map((p, i) =>
      i === 0
        ? {
            ...p,
            payload: {
              ...p.payload,
              authorization: { ...p.payload.authorization, value: "9999999" },
            },
          }
        : p,
    );
    const res = await createJob(
      postRequest({
        authorizations: tampered,
        budgetCents: 500,
        job: "research 10 competitors and write a one-page brief",
        payerAddress: wallet.address,
        paymentMode: "user",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a user job whose wallet cannot afford it, with no fallback to demo", async () => {
    const { generateUserWallet, signUserHandoffAuthorizations } = await import(
      "@coven/payments/user-wallet"
    );
    const wallet = generateUserWallet();
    const { authorizations } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
    // Stub the RPC balance check: $1.00 in the wallet, $5.00 job.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: "0x186a0" }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const res = await createJob(
        postRequest({
          authorizations,
          budgetCents: 500,
          job: "research 10 competitors and write a one-page brief",
          payerAddress: wallet.address,
          paymentMode: "user",
        }),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error?: string };
      expect(data.error).toMatch(/insufficient test USDC/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("creates a user-funded job with payer attribution when funded", async () => {
    const { generateUserWallet, signUserHandoffAuthorizations } = await import(
      "@coven/payments/user-wallet"
    );
    const wallet = generateUserWallet();
    const { authorizations } = await signUserHandoffAuthorizations({
      budgetCents: 500,
      privateKey: wallet.privateKey,
    });
    // Stub the RPC balance check: $20.00 in the wallet.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: "0x1312d00" }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const res = await createJob(
        postRequest({
          authorizations,
          budgetCents: 500,
          job: "research 10 competitors and write a one-page brief",
          payerAddress: wallet.address,
          paymentMode: "user",
        }),
      );
      expect(res.status).toBe(202);
      const data = (await res.json()) as { jobId: string };
      const ledger = await getLedger();
      const job = await ledger.getJob(data.jobId);
      expect(job?.paymentMode).toBe("user");
      expect(job?.payerAddress).toBe(wallet.address);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

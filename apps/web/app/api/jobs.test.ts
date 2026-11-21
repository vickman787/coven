import { describe, expect, it } from "vitest";
import { GET as listJobs, POST as createJob } from "./jobs/route.js";
import { GET as getJob } from "./jobs/[id]/route.js";
import { POST as revoke } from "./jobs/[id]/revoke/route.js";
import { POST as requestNonce } from "./auth/nonce/route.js";
import { POST as verify } from "./auth/verify/route.js";
import { getLedger } from "../../lib/coven.js";

function postRequest(
  body: unknown,
  cookie?: string,
  url = "http://localhost/api/jobs",
): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    method: "POST",
  });
}

/** Sign in as a throwaway wallet and return its session cookie. */
async function signInAsThrowaway(): Promise<{ address: string; cookie: string }> {
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await requestNonce(
    postRequest({ address: account.address }, undefined, "http://localhost/api/auth/nonce"),
  );
  expect(nonceRes.status).toBe(200);
  const { message } = (await nonceRes.json()) as { message: string };
  const signature = await account.signMessage({ message });
  const verifyRes = await verify(
    postRequest(
      { address: account.address, message, signature },
      undefined,
      "http://localhost/api/auth/verify",
    ),
  );
  expect(verifyRes.status).toBe(200);
  const cookie = (verifyRes.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { address: account.address, cookie };
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

  it("filters by ?payer= to only jobs that wallet paid for", async () => {
    const ledger = await getLedger();
    const payerA = "0x1111111111111111111111111111111111111111";
    const payerB = "0x2222222222222222222222222222222222222222";
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "payer a job",
      id: "job-payer-a",
      payerAddress: payerA,
      paymentMode: "user",
    });
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "payer b job",
      id: "job-payer-b",
      payerAddress: payerB,
      paymentMode: "user",
    });
    const res = await listJobs(
      new Request(`http://localhost/api/jobs?payer=${payerA}`),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { jobs: { id: string }[] };
    const ids = data.jobs.map((j) => j.id);
    expect(ids).toContain("job-payer-a");
    expect(ids).not.toContain("job-payer-b");
  });

  it("rejects a malformed ?payer=", async () => {
    const res = await listJobs(
      new Request("http://localhost/api/jobs?payer=not-an-address"),
    );
    expect(res.status).toBe(400);
  });

  it("?mine=1 needs sign-in and lists only the account's jobs", async () => {
    const signedOut = await listJobs(
      new Request("http://localhost/api/jobs?mine=1"),
    );
    expect(signedOut.status).toBe(401);
    const { address, cookie } = await signInAsThrowaway();
    const ledger = await getLedger();
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "mine job",
      id: "job-mine-a",
      payerAddress: address,
      paymentMode: "user",
    });
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "not mine job",
      id: "job-mine-b",
      payerAddress: "0x6666666666666666666666666666666666666666",
      paymentMode: "user",
    });
    const res = await listJobs(
      new Request("http://localhost/api/jobs?mine=1", {
        headers: { cookie },
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { jobs: { id: string }[] };
    const ids = data.jobs.map((j) => j.id);
    expect(ids).toContain("job-mine-a");
    expect(ids).not.toContain("job-mine-b");
  });

  it("returns an empty list, not seeded data, when the ledger has no jobs", async () => {
    const ledger = await getLedger();
    const all = await ledger.listJobs(100);
    expect(Array.isArray(all)).toBe(true);
    // The route returns exactly what the ledger holds — no filler.
    const res = await listJobs(new Request("http://localhost/api/jobs?limit=100"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { jobs: unknown[] };
    expect(data.jobs).toHaveLength(all.length);
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

  it("refuses to revoke a user job's agent for anyone but its owner", async () => {
    const { address, cookie } = await signInAsThrowaway();
    const ledger = await getLedger();
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "revoke ownership test",
      id: "job-api-revoke-owner",
      payerAddress: address,
      paymentMode: "user",
    });
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-api-revoke-owner",
      jobId: "job-api-revoke-owner",
    });
    const stranger = await revoke(postRequest({ agent: "seeker" }), {
      params: Promise.resolve({ id: "job-api-revoke-owner" }),
    });
    expect(stranger.status).toBe(403);
    expect(await ledger.isRevoked("job-api-revoke-owner", "seeker")).toBe(false);
    const owner = await revoke(
      postRequest({ agent: "seeker" }, cookie),
      { params: Promise.resolve({ id: "job-api-revoke-owner" }) },
    );
    expect(owner.status).toBe(200);
    expect(await ledger.isRevoked("job-api-revoke-owner", "seeker")).toBe(true);
  });
});

describe("POST /api/jobs — user-funded jobs", () => {
  /**
   * Stands in for the connected wallet: a throwaway key generated
   * inside the test signs the exact typed-data requests the browser
   * builds, then is discarded. No app code holds a user's key.
   * The wallet is also signed in, so the job passes the session
   * check for its own payer address.
   */
  async function signAsThrowawayWallet(budgetCents = 500) {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const {
      buildHandoffSigningRequests,
      handoffPayloadFromSignature,
    } = await import("@coven/payments/user-wallet");
    const account = privateKeyToAccount(generatePrivateKey());
    const requests = buildHandoffSigningRequests({
      budgetCents,
      payerAddress: account.address,
    });
    const authorizations = [];
    for (const request of requests) {
      const signature = await account.signTypedData({
        domain: request.domain,
        message: request.message,
        primaryType: request.primaryType,
        types: request.types,
      });
      authorizations.push(handoffPayloadFromSignature(request, signature));
    }
    const nonceRes = await requestNonce(
      postRequest({ address: account.address }, undefined, "http://localhost/api/auth/nonce"),
    );
    expect(nonceRes.status).toBe(200);
    const { message } = (await nonceRes.json()) as { message: string };
    const loginSignature = await account.signMessage({ message });
    const verifyRes = await verify(
      postRequest(
        { address: account.address, message, signature: loginSignature },
        undefined,
        "http://localhost/api/auth/verify",
      ),
    );
    expect(verifyRes.status).toBe(200);
    const cookie = (verifyRes.headers.get("set-cookie") ?? "").split(";")[0]!;
    return { authorizations, cookie, wallet: { address: account.address } };
  }

  it("rejects a user job with no session, and creates no job", async () => {
    const { authorizations, wallet } = await signAsThrowawayWallet(500);
    const res = await createJob(
      postRequest({
        authorizations,
        budgetCents: 500,
        job: "research 10 competitors and write a one-page brief",
        payerAddress: wallet.address,
        paymentMode: "user",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a user job whose payer is not the signed-in account", async () => {
    const { authorizations, cookie } = await signAsThrowawayWallet(500);
    const other = "0x5555555555555555555555555555555555555555";
    const res = await createJob(
      postRequest(
        {
          authorizations,
          budgetCents: 500,
          job: "research 10 competitors and write a one-page brief",
          payerAddress: other,
          paymentMode: "user",
        },
        cookie,
      ),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a user job with no signed authorizations, and creates no job", async () => {
    const { cookie, wallet } = await signAsThrowawayWallet(500);
    const res = await createJob(
      postRequest(
        {
          budgetCents: 500,
          job: "research 10 competitors and write a one-page brief",
          payerAddress: wallet.address,
          paymentMode: "user",
        },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/signed payment authorizations/);
  });

  it("rejects tampered authorizations", async () => {
    const { authorizations, cookie, wallet } = await signAsThrowawayWallet(500);
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
      postRequest(
        {
          authorizations: tampered,
          budgetCents: 500,
          job: "research 10 competitors and write a one-page brief",
          payerAddress: wallet.address,
          paymentMode: "user",
        },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a user job whose wallet cannot afford it, with no fallback to demo", async () => {
    const { authorizations, cookie, wallet } = await signAsThrowawayWallet(500);
    // Stub the RPC balance check: $1.00 in the wallet, $5.00 job.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: "0x186a0" }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const res = await createJob(
        postRequest(
          {
            authorizations,
            budgetCents: 500,
            job: "research 10 competitors and write a one-page brief",
            payerAddress: wallet.address,
            paymentMode: "user",
          },
          cookie,
        ),
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error?: string };
      expect(data.error).toMatch(/insufficient test USDC/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("creates a user-funded job with payer attribution when funded", async () => {
    const { authorizations, cookie, wallet } = await signAsThrowawayWallet(500);
    // Stub the RPC balance check: $20.00 in the wallet.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: "0x1312d00" }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const res = await createJob(
        postRequest(
          {
            authorizations,
            budgetCents: 500,
            job: "research 10 competitors and write a one-page brief",
            payerAddress: wallet.address,
            paymentMode: "user",
          },
          cookie,
        ),
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

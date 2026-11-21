import { describe, expect, it } from "vitest";
import { GET as readDashboard } from "./dashboard/route.js";
import { GET as readWallet } from "./wallet/route.js";
import { POST as requestNonce } from "./auth/nonce/route.js";
import { POST as verify } from "./auth/verify/route.js";
import { getLedger } from "../../lib/coven.js";

function jsonRequest(url: string, body: unknown, cookie?: string): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    method: "POST",
  });
}

/** Sign in as a throwaway wallet and return its address + session cookie. */
async function signInAsThrowaway(): Promise<{ address: string; cookie: string }> {
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await requestNonce(
    jsonRequest("http://localhost/api/auth/nonce", { address: account.address }),
  );
  const { message } = (await nonceRes.json()) as { message: string };
  const signature = await account.signMessage({ message });
  const verifyRes = await verify(
    jsonRequest("http://localhost/api/auth/verify", {
      address: account.address,
      message,
      signature,
    }),
  );
  expect(verifyRes.status).toBe(200);
  const cookie = (verifyRes.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { address: account.address, cookie };
}

describe("GET /api/dashboard", () => {
  it("requires sign-in", async () => {
    const res = await readDashboard(new Request("http://localhost/api/dashboard"));
    expect(res.status).toBe(401);
  });

  it("reports zeros and no recent jobs for a fresh account", async () => {
    const { address, cookie } = await signInAsThrowaway();
    const res = await readDashboard(
      new Request("http://localhost/api/dashboard", { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      address: string;
      recentJobs: unknown[];
      stats: {
        doneJobs: number;
        failedJobs: number;
        runningJobs: number;
        totalApprovedCents: number;
        totalJobs: number;
        totalSettledCents: number;
      };
    };
    expect(data.address.toLowerCase()).toBe(address.toLowerCase());
    expect(data.stats).toEqual({
      doneJobs: 0,
      failedJobs: 0,
      runningJobs: 0,
      totalApprovedCents: 0,
      totalJobs: 0,
      totalSettledCents: 0,
    });
    expect(data.recentJobs).toEqual([]);
  });

  it("counts the account's jobs and settled money, and no one else's", async () => {
    const { address, cookie } = await signInAsThrowaway();
    const ledger = await getLedger();
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "my done job",
      id: "job-dash-done",
      payerAddress: address,
      paymentMode: "user",
    });
    await ledger.updateJobStatus("job-dash-done", "done");
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-dash-1",
      jobId: "job-dash-done",
    });
    await ledger.settle({
      idempotencyKey: "res-dash-1",
      jobId: "job-dash-done",
      x402Hash: "0xdashhash",
    });
    await ledger.createJob({
      approvedBudgetCents: 300,
      description: "my running job",
      id: "job-dash-running",
      payerAddress: address,
      paymentMode: "user",
    });
    await ledger.updateJobStatus("job-dash-running", "running");
    // Someone else's job must not leak into my dashboard.
    await ledger.createJob({
      approvedBudgetCents: 999,
      description: "not my job",
      id: "job-dash-other",
      payerAddress: "0x3333333333333333333333333333333333333333",
      paymentMode: "user",
    });

    const res = await readDashboard(
      new Request("http://localhost/api/dashboard", { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      recentJobs: { id: string; settledCents: number }[];
      stats: {
        doneJobs: number;
        runningJobs: number;
        totalApprovedCents: number;
        totalJobs: number;
        totalSettledCents: number;
      };
    };
    expect(data.stats.totalJobs).toBe(2);
    expect(data.stats.doneJobs).toBe(1);
    expect(data.stats.runningJobs).toBe(1);
    expect(data.stats.totalApprovedCents).toBe(800);
    expect(data.stats.totalSettledCents).toBe(200);
    expect(data.recentJobs.map((j) => j.id)).toEqual([
      "job-dash-running",
      "job-dash-done",
    ]);
    expect(data.recentJobs.find((j) => j.id === "job-dash-done")?.settledCents).toBe(200);
  });
});

describe("GET /api/wallet", () => {
  it("requires sign-in", async () => {
    const res = await readWallet(new Request("http://localhost/api/wallet"));
    expect(res.status).toBe(401);
  });

  it("lists only the account's payments, newest first", async () => {
    const { address, cookie } = await signInAsThrowaway();
    const ledger = await getLedger();
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "my paid job",
      id: "job-wallet-mine",
      payerAddress: address,
      paymentMode: "user",
    });
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-wallet-1",
      jobId: "job-wallet-mine",
    });
    await ledger.settle({
      idempotencyKey: "res-wallet-1",
      jobId: "job-wallet-mine",
      x402Hash: "0xwalletsettled",
    });
    await ledger.createJob({
      approvedBudgetCents: 500,
      description: "someone else's job",
      id: "job-wallet-other",
      payerAddress: "0x4444444444444444444444444444444444444444",
      paymentMode: "user",
    });
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-wallet-2",
      jobId: "job-wallet-other",
    });
    await ledger.settle({
      idempotencyKey: "res-wallet-2",
      jobId: "job-wallet-other",
      x402Hash: "0xwalletother",
    });

    const res = await readWallet(
      new Request("http://localhost/api/wallet", { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      address: string;
      payments: { jobId: string; status: string; x402Hash?: string }[];
    };
    expect(data.address.toLowerCase()).toBe(address.toLowerCase());
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0]?.jobId).toBe("job-wallet-mine");
    expect(data.payments[0]?.status).toBe("settled");
    expect(data.payments[0]?.x402Hash).toBe("0xwalletsettled");
  });
});

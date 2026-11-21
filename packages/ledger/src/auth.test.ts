import { describe, expect, it } from "vitest";
import { createTestLedgerWithPool } from "./test-helpers.js";

const ALICE = "0xAbC1234567890abcdef1234567890ABCDEF12345";
const ALICE_LOWER = ALICE.toLowerCase();
const BOB = "0x9999999999999999999999999999999999999999";

describe("accounts", () => {
  it("createAccount is idempotent and normalizes to lowercase", async () => {
    const { ledger } = await createTestLedgerWithPool();
    const first = await ledger.createAccount(ALICE);
    expect(first.address).toBe(ALICE_LOWER);
    expect(first.displayName).toBeNull();
    expect(first.createdAt).toBeDefined();

    const second = await ledger.createAccount(ALICE_LOWER);
    expect(second.address).toBe(ALICE_LOWER);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("getAccount returns null for an unknown address", async () => {
    const { ledger } = await createTestLedgerWithPool();
    expect(await ledger.getAccount(ALICE)).toBeNull();
  });

  it("getAccount finds an account created with different casing", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    const found = await ledger.getAccount("0x" + ALICE.slice(2).toUpperCase());
    expect(found?.address).toBe(ALICE_LOWER);
  });

  it("createAccount and getAccount reject invalid addresses", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await expect(ledger.createAccount("not-an-address")).rejects.toThrow(/valid Ethereum address/);
    await expect(ledger.createAccount("0x1234")).rejects.toThrow(/valid Ethereum address/);
    await expect(ledger.getAccount("0xZZZZ567890abcdef1234567890ABCDEF12345678")).rejects.toThrow(
      /valid Ethereum address/,
    );
  });
});

describe("display names", () => {
  it("setDisplayName sets and reads back a valid name", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    const updated = await ledger.setDisplayName(ALICE, "  Vickman  ");
    expect(updated.displayName).toBe("Vickman");
    expect((await ledger.getAccount(ALICE))?.displayName).toBe("Vickman");
  });

  it("setDisplayName rejects empty and too-long names", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    await expect(ledger.setDisplayName(ALICE, "")).rejects.toThrow(/1–40/);
    await expect(ledger.setDisplayName(ALICE, "   ")).rejects.toThrow(/1–40/);
    await expect(ledger.setDisplayName(ALICE, "x".repeat(41))).rejects.toThrow(/1–40/);
    // Exactly 40 chars is fine.
    await expect(ledger.setDisplayName(ALICE, "x".repeat(40))).resolves.toMatchObject({
      displayName: "x".repeat(40),
    });
  });

  it("setDisplayName throws when the account does not exist", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await expect(ledger.setDisplayName(ALICE, "Vickman")).rejects.toThrow(/account not found/);
  });
});

describe("login nonces", () => {
  it("createLoginNonce returns a 64-char hex nonce expiring in ~10 minutes", async () => {
    const { ledger } = await createTestLedgerWithPool();
    const before = Date.now();
    const { nonce, expiresAt } = await ledger.createLoginNonce(ALICE);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    const expiry = new Date(expiresAt).getTime();
    expect(expiry - before).toBeGreaterThan(9 * 60 * 1000);
    expect(expiry - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it("consumeLoginNonce succeeds once, then fails; wrong nonce fails", async () => {
    const { ledger } = await createTestLedgerWithPool();
    const { nonce } = await ledger.createLoginNonce(ALICE);
    expect(await ledger.consumeLoginNonce(ALICE, "0".repeat(64))).toBe(false);
    expect(await ledger.consumeLoginNonce(ALICE, nonce)).toBe(true);
    expect(await ledger.consumeLoginNonce(ALICE, nonce)).toBe(false);
  });

  it("a second createLoginNonce replaces the first", async () => {
    const { ledger } = await createTestLedgerWithPool();
    const first = await ledger.createLoginNonce(ALICE);
    const second = await ledger.createLoginNonce(ALICE);
    expect(second.nonce).not.toBe(first.nonce);
    expect(await ledger.consumeLoginNonce(ALICE, first.nonce)).toBe(false);
    expect(await ledger.consumeLoginNonce(ALICE, second.nonce)).toBe(true);
  });

  it("an expired nonce fails and is deleted", async () => {
    const { ledger, pool } = await createTestLedgerWithPool();
    await pool.query(
      `INSERT INTO auth_nonces (address, nonce, expires_at) VALUES ($1, $2, $3)`,
      [ALICE_LOWER, "deadbeef".repeat(8), "2000-01-01T00:00:00.000Z"],
    );
    expect(await ledger.consumeLoginNonce(ALICE, "deadbeef".repeat(8))).toBe(false);
    // Gone from the table: a second consume still fails, and the row is gone.
    const { rows } = await pool.query(`SELECT * FROM auth_nonces WHERE address = $1`, [ALICE_LOWER]);
    expect(rows.length).toBe(0);
  });
});

describe("sessions", () => {
  it("createSession returns a 64-char token expiring in ~30 days", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    const before = Date.now();
    const { token, expiresAt } = await ledger.createSession(ALICE);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const expiry = new Date(expiresAt).getTime();
    expect(expiry - before).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(expiry - before).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);

    const session = await ledger.getSession(token);
    expect(session?.address).toBe(ALICE_LOWER);
    expect(session?.expiresAt).toBe(expiresAt);
  });

  it("createSession throws when the account does not exist", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await expect(ledger.createSession(ALICE)).rejects.toThrow(/account not found/);
  });

  it("getSession returns null for an unknown token", async () => {
    const { ledger } = await createTestLedgerWithPool();
    expect(await ledger.getSession("a".repeat(64))).toBeNull();
  });

  it("getSession returns null for an expired session and deletes it", async () => {
    const { ledger, pool } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    await pool.query(
      `INSERT INTO sessions (id, address, expires_at) VALUES ($1, $2, $3)`,
      ["b".repeat(64), ALICE_LOWER, "2000-01-01T00:00:00.000Z"],
    );
    expect(await ledger.getSession("b".repeat(64))).toBeNull();
    const { rows } = await pool.query(`SELECT * FROM sessions WHERE id = $1`, ["b".repeat(64)]);
    expect(rows.length).toBe(0);
  });

  it("deleteSession removes the session", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    const { token } = await ledger.createSession(ALICE);
    expect(await ledger.getSession(token)).not.toBeNull();
    await ledger.deleteSession(token);
    expect(await ledger.getSession(token)).toBeNull();
    // Deleting a missing token is a no-op.
    await ledger.deleteSession(token);
  });
});

describe("account dashboard", () => {
  it("no jobs → all zeros", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    expect(await ledger.getAccountDashboard(ALICE)).toEqual({
      totalJobs: 0,
      doneJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      totalApprovedCents: 0,
      totalSettledCents: 0,
    });
  });

  it("counts by status and sums approved + settled money", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    await ledger.createAccount(BOB);

    const doneJob = await ledger.createJob({
      approvedBudgetCents: 500,
      description: "done job",
      id: "job-done",
      payerAddress: ALICE,
      paymentMode: "user",
    });
    const runningJob = await ledger.createJob({
      approvedBudgetCents: 300,
      description: "running job",
      id: "job-running",
      payerAddress: "0x" + ALICE.slice(2).toUpperCase(),
      paymentMode: "user",
    });
    await ledger.createJob({
      approvedBudgetCents: 200,
      description: "failed job",
      id: "job-failed",
      payerAddress: ALICE,
      paymentMode: "user",
    });
    // Another wallet's job must not leak into Alice's dashboard.
    await ledger.createJob({
      approvedBudgetCents: 9999,
      description: "bob job",
      id: "job-bob",
      payerAddress: BOB,
      paymentMode: "user",
    });
    await ledger.updateJobStatus(doneJob.id, "done");
    await ledger.updateJobStatus(runningJob.id, "running");
    await ledger.updateJobStatus("job-failed", "failed");

    // One settled payment ($2.00) and one unresolved payment ($1.00)
    // on the done job; only the settled one counts.
    await ledger.reserve({
      agentRole: "seeker",
      amountCents: 200,
      idempotencyKey: "res-settled",
      jobId: "job-done",
    });
    await ledger.settle({ idempotencyKey: "res-settled", jobId: "job-done", x402Hash: "0xhash1" });
    await ledger.createUnresolvedPayment({
      amountCents: 100,
      fromAgent: "keeper",
      idempotencyKey: "pay-unresolved",
      jobId: "job-done",
      toAgent: "weaver",
    });

    expect(await ledger.getAccountDashboard(ALICE)).toEqual({
      totalJobs: 3,
      doneJobs: 1,
      runningJobs: 1,
      failedJobs: 1,
      totalApprovedCents: 1000,
      totalSettledCents: 200,
    });
    // Bob sees only his own job.
    expect(await ledger.getAccountDashboard(BOB)).toEqual({
      totalJobs: 1,
      doneJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      totalApprovedCents: 9999,
      totalSettledCents: 0,
    });
  });
});

describe("listAccountPayments", () => {
  it("returns only that wallet's payments, newest first, honoring the limit", async () => {
    const { ledger } = await createTestLedgerWithPool();
    await ledger.createAccount(ALICE);
    await ledger.createAccount(BOB);

    await ledger.createJob({
      approvedBudgetCents: 1000,
      description: "alice job",
      id: "job-alice",
      payerAddress: ALICE,
      paymentMode: "user",
    });
    await ledger.createJob({
      approvedBudgetCents: 1000,
      description: "bob job",
      id: "job-bob",
      payerAddress: BOB,
      paymentMode: "user",
    });

    // Three payments on Alice's job (created in order), one on Bob's.
    await ledger.createUnresolvedPayment({
      amountCents: 100,
      fromAgent: "keeper",
      idempotencyKey: "pay-a1",
      jobId: "job-alice",
      toAgent: "seeker",
    });
    await ledger.createUnresolvedPayment({
      amountCents: 150,
      fromAgent: "keeper",
      idempotencyKey: "pay-a2",
      jobId: "job-alice",
      toAgent: "weaver",
    });
    await ledger.reserve({
      agentRole: "warden",
      amountCents: 200,
      idempotencyKey: "res-a3",
      jobId: "job-alice",
    });
    await ledger.settle({ idempotencyKey: "res-a3", jobId: "job-alice", x402Hash: "0xhash9" });
    await ledger.createUnresolvedPayment({
      amountCents: 500,
      fromAgent: "keeper",
      idempotencyKey: "pay-b1",
      jobId: "job-bob",
      toAgent: "seeker",
    });

    const all = await ledger.listAccountPayments(ALICE);
    expect(all.map((p) => p.amountCents)).toEqual([200, 150, 100]);
    expect(all[0]).toMatchObject({
      jobId: "job-alice",
      description: "alice job",
      amountCents: 200,
      status: "settled",
      x402Hash: "0xhash9",
    });
    expect(all[1]).toMatchObject({ status: "unresolved" });
    expect(all[1]!.x402Hash).toBeUndefined();
    expect(all.every((p) => p.createdAt)).toBe(true);

    const limited = await ledger.listAccountPayments(ALICE, 2);
    expect(limited.map((p) => p.amountCents)).toEqual([200, 150]);

    // Bob sees only his own payment.
    const bobs = await ledger.listAccountPayments(BOB);
    expect(bobs.map((p) => p.amountCents)).toEqual([500]);

    // Empty wallet → empty list.
    expect(await ledger.listAccountPayments("0x1111111111111111111111111111111111111111")).toEqual(
      [],
    );
  });
});

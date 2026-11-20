import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type {
  AgentRole,
  Job,
  LedgerTotals,
  Payment,
  Reservation,
} from "@coven/shared";

/**
 * PostgreSQL-backed ledger.
 *
 * Money is integer cents everywhere. Every mutation that touches money
 * runs inside a single transaction, with the job row locked
 * (SELECT ... FOR UPDATE) so two agents racing for the last dollar
 * cannot both win. The invariant
 *   settled + reserved + unresolved <= approved budget
 * is checked inside that transaction, before the write commits.
 *
 * Payments are idempotent on idempotencyKey: the same key twice
 * returns the same row and moves money once.
 *
 * An uncertain payment stays `unresolved` until it is confirmed
 * (settled, with an x402 hash) or released (failed). It is never
 * shown as settled.
 */

export interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<PoolClientLike>;
}

export interface PoolClientLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

function schemaSql(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, "schema.sql"), "utf-8");
}

function toIso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function rowToJob(row: Record<string, unknown>): Job {
  const createdAt = toIso(row.created_at);
  const payerAddress =
    typeof row.payer_address === "string" && row.payer_address.length > 0
      ? row.payer_address
      : undefined;
  const paymentMode =
    row.payment_mode === "user" ? ("user" as const) : ("demo" as const);
  return {
    approvedBudgetCents: row.approved_budget_cents as number,
    ...(createdAt ? { createdAt } : {}),
    description: row.description as string,
    id: row.id as string,
    ...(payerAddress ? { payerAddress } : {}),
    paymentMode,
    status: row.status as Job["status"],
  };
}

function rowToReservation(row: Record<string, unknown>): Reservation {
  return {
    agentRole: row.agent_role as Reservation["agentRole"],
    amountCents: row.amount_cents as number,
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    jobId: row.job_id as string,
    status: row.status as Reservation["status"],
  };
}

function rowToPayment(row: Record<string, unknown>): Payment {
  return {
    amountCents: row.amount_cents as number,
    fromAgent: row.from_agent as Payment["fromAgent"],
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    jobId: row.job_id as string,
    status: row.status as Payment["status"],
    toAgent: row.to_agent as Payment["toAgent"],
    ...(row.x402_hash ? { x402Hash: row.x402_hash as string } : {}),
  };
}

export class PostgresLedger {
  private pool: PoolLike;
  // In-process serializer for money mutations. Postgres SELECT ... FOR UPDATE
  // is the cross-process guarantee; this mutex serializes concurrent calls
  // in the same process, including against pg-mem in tests, where row locks
  // do not block concurrent transactions the way real Postgres does.
  private mutex: Promise<void> = Promise.resolve();

  constructor(pool: PoolLike) {
    this.pool = pool;
  }

  static fromEnv(): PostgresLedger {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    return new PostgresLedger(new Pool({ connectionString }) as unknown as PoolLike);
  }

  async init(): Promise<void> {
    await this.pool.query(schemaSql());
  }

  async createJob(input: {
    approvedBudgetCents: number;
    description: string;
    id: string;
    payerAddress?: string;
    paymentMode?: "demo" | "user";
  }): Promise<Job> {
    if (!Number.isInteger(input.approvedBudgetCents) || input.approvedBudgetCents < 0) {
      throw new Error("approvedBudgetCents must be a non-negative integer");
    }
    if (input.payerAddress && !/^0x[0-9a-fA-F]{40}$/.test(input.payerAddress)) {
      throw new Error("payerAddress must be a valid address");
    }
    const { rows } = await this.pool.query(
      `INSERT INTO jobs (id, description, approved_budget_cents, payer_address, payment_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [
        input.id,
        input.description,
        input.approvedBudgetCents,
        input.payerAddress ?? null,
        input.paymentMode ?? "demo",
      ],
    );
    if (rows.length > 0) return rowToJob(rows[0]!);
    const existing = await this.pool.query(`SELECT * FROM jobs WHERE id = $1`, [input.id]);
    return rowToJob(existing.rows[0]!);
  }

  /** Sum of settled, reserved, and unresolved money for a job. */
  async getTotals(jobId: string): Promise<LedgerTotals> {
    const job = await this.pool.query(
      `SELECT approved_budget_cents FROM jobs WHERE id = $1`,
      [jobId],
    );
    if (job.rows.length === 0) throw new Error(`job not found: ${jobId}`);
    const settled = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments
       WHERE job_id = $1 AND status = 'settled'`,
      [jobId],
    );
    const reserved = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM reservations
       WHERE job_id = $1 AND status = 'reserved'`,
      [jobId],
    );
    const unresolved = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments
       WHERE job_id = $1 AND status = 'unresolved'`,
      [jobId],
    );
    return {
      approvedBudgetCents: job.rows[0]!.approved_budget_cents as number,
      reservedCents: Number(reserved.rows[0]!.total),
      settledCents: Number(settled.rows[0]!.total),
      unresolvedCents: Number(unresolved.rows[0]!.total),
    };
  }

  async isRevoked(jobId: string, agentRole: AgentRole): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM agent_revocations WHERE job_id = $1 AND agent_role = $2`,
      [jobId, agentRole],
    );
    return rows.length > 0;
  }

  private async totalsInTx(
    client: PoolClientLike,
    jobId: string,
  ): Promise<{ approved: number; reserved: number; settled: number; unresolved: number }> {
    const job = await client.query(
      `SELECT approved_budget_cents FROM jobs WHERE id = $1 FOR UPDATE`,
      [jobId],
    );
    if (job.rows.length === 0) throw new Error(`job not found: ${jobId}`);
    const sums = await client.query(
      `SELECT
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE job_id = $1 AND status = 'settled') AS settled,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM reservations WHERE job_id = $1 AND status = 'reserved') AS reserved,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE job_id = $1 AND status = 'unresolved') AS unresolved`,
      [jobId],
    );
    return {
      approved: job.rows[0]!.approved_budget_cents as number,
      reserved: Number(sums.rows[0]!.reserved),
      settled: Number(sums.rows[0]!.settled),
      unresolved: Number(sums.rows[0]!.unresolved),
    };
  }

  private async acquire(): Promise<() => void> {
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.mutex;
    this.mutex = previous.then(() => lock);
    await previous;
    return release;
  }

  private async withTx<T>(fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
    const releaseMutex = await this.acquire();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
      releaseMutex();
    }
  }

  async reserve(input: {
    agentRole: AgentRole;
    amountCents: number;
    idempotencyKey: string;
    jobId: string;
  }): Promise<Reservation> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("amountCents must be a positive integer");
    }
    return this.withTx(async (client) => {
      // Idempotent: same key returns the same reservation, no second charge.
      const existing = await client.query(
        `SELECT * FROM reservations WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      if (existing.rows.length > 0) return rowToReservation(existing.rows[0]!);

      if (await this.isRevokedInTx(client, input.jobId, input.agentRole)) {
        throw new Error(`agent revoked: ${input.agentRole}`);
      }
      const totals = await this.totalsInTx(client, input.jobId);
      if (totals.settled + totals.reserved + totals.unresolved + input.amountCents > totals.approved) {
        throw new Error("insufficient budget: reservation would exceed approved budget");
      }
      const id = `res-${input.idempotencyKey}`;
      const { rows } = await client.query(
        `INSERT INTO reservations (id, job_id, agent_role, amount_cents, status, idempotency_key)
         VALUES ($1, $2, $3, $4, 'reserved', $5) RETURNING *`,
        [id, input.jobId, input.agentRole, input.amountCents, input.idempotencyKey],
      );
      return rowToReservation(rows[0]!);
    });
  }

  private async isRevokedInTx(
    client: PoolClientLike,
    jobId: string,
    agentRole: AgentRole,
  ): Promise<boolean> {
    const { rows } = await client.query(
      `SELECT 1 FROM agent_revocations WHERE job_id = $1 AND agent_role = $2`,
      [jobId, agentRole],
    );
    return rows.length > 0;
  }

  async settle(input: {
    idempotencyKey: string;
    jobId: string;
    x402Hash?: string;
  }): Promise<Payment> {
    return this.withTx(async (client) => {
      const reservation = await client.query(
        `SELECT * FROM reservations WHERE idempotency_key = $1 AND job_id = $2 FOR UPDATE`,
        [input.idempotencyKey, input.jobId],
      );
      if (reservation.rows.length === 0) {
        throw new Error(`reservation not found: ${input.idempotencyKey}`);
      }
      const res = rowToReservation(reservation.rows[0]!);
      if (res.status === "settled") {
        const existing = await client.query(
          `SELECT * FROM payments WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        if (existing.rows.length > 0) return rowToPayment(existing.rows[0]!);
        throw new Error(`reservation settled but payment missing: ${input.idempotencyKey}`);
      }
      if (res.status !== "reserved") {
        throw new Error(`cannot settle reservation in status ${res.status}`);
      }
      if (await this.isRevokedInTx(client, input.jobId, res.agentRole)) {
        throw new Error(`agent revoked: ${res.agentRole}`);
      }
      await client.query(
        `UPDATE reservations SET status = 'settled', updated_at = now() WHERE id = $1`,
        [res.id],
      );
      const paymentId = `pay-${input.idempotencyKey}`;
      // toAgent is not stored on a reservation; the settled payment records
      // the next agent as the reservation's agent (the agent being paid).
      const { rows } = await client.query(
        `INSERT INTO payments (id, job_id, from_agent, to_agent, amount_cents, status, idempotency_key, x402_hash)
         VALUES ($1, $2, 'keeper', $3, $4, 'settled', $5, $6)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [paymentId, input.jobId, res.agentRole, res.amountCents, input.idempotencyKey, input.x402Hash ?? null],
      );
      if (rows.length > 0) return rowToPayment(rows[0]!);
      const existing = await client.query(
        `SELECT * FROM payments WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      return rowToPayment(existing.rows[0]!);
    });
  }

  async createUnresolvedPayment(input: {
    amountCents: number;
    fromAgent: AgentRole;
    idempotencyKey: string;
    jobId: string;
    toAgent: AgentRole;
  }): Promise<Payment> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("amountCents must be a positive integer");
    }
    return this.withTx(async (client) => {
      const existing = await client.query(
        `SELECT * FROM payments WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      if (existing.rows.length > 0) return rowToPayment(existing.rows[0]!);
      if (await this.isRevokedInTx(client, input.jobId, input.fromAgent)) {
        throw new Error(`agent revoked: ${input.fromAgent}`);
      }
      const totals = await this.totalsInTx(client, input.jobId);
      if (totals.settled + totals.reserved + totals.unresolved + input.amountCents > totals.approved) {
        throw new Error("insufficient budget: payment would exceed approved budget");
      }
      const id = `pay-${input.idempotencyKey}`;
      const { rows } = await client.query(
        `INSERT INTO payments (id, job_id, from_agent, to_agent, amount_cents, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, 'unresolved', $6) RETURNING *`,
        [id, input.jobId, input.fromAgent, input.toAgent, input.amountCents, input.idempotencyKey],
      );
      return rowToPayment(rows[0]!);
    });
  }

  /**
   * Consume a reserved reservation into an unresolved payment, atomically.
   * The reservation is released and a payment in status `unresolved` is
   * created for the same amount, so the ledger total does not change and
   * the money is never double-counted. The payment is then confirmed
   * (settled, with an x402 hash) or released (failed) by the x402 flow.
   */
  async payFromReservation(input: {
    fromAgent: AgentRole;
    jobId: string;
    paymentIdempotencyKey: string;
    reservationIdempotencyKey: string;
    toAgent: AgentRole;
  }): Promise<Payment> {
    return this.withTx(async (client) => {
      const existingPayment = await client.query(
        `SELECT * FROM payments WHERE idempotency_key = $1`,
        [input.paymentIdempotencyKey],
      );
      if (existingPayment.rows.length > 0) {
        return rowToPayment(existingPayment.rows[0]!);
      }
      const reservation = await client.query(
        `SELECT * FROM reservations WHERE idempotency_key = $1 AND job_id = $2 FOR UPDATE`,
        [input.reservationIdempotencyKey, input.jobId],
      );
      if (reservation.rows.length === 0) {
        throw new Error(`reservation not found: ${input.reservationIdempotencyKey}`);
      }
      const res = rowToReservation(reservation.rows[0]!);
      if (res.status !== "reserved") {
        throw new Error(`cannot pay from reservation in status ${res.status}`);
      }
      if (await this.isRevokedInTx(client, input.jobId, input.fromAgent)) {
        throw new Error(`agent revoked: ${input.fromAgent}`);
      }
      await client.query(
        `UPDATE reservations SET status = 'released', updated_at = now() WHERE id = $1`,
        [res.id],
      );
      const id = `pay-${input.paymentIdempotencyKey}`;
      const { rows } = await client.query(
        `INSERT INTO payments (id, job_id, from_agent, to_agent, amount_cents, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, 'unresolved', $6) RETURNING *`,
        [id, input.jobId, input.fromAgent, input.toAgent, res.amountCents, input.paymentIdempotencyKey],
      );
      return rowToPayment(rows[0]!);
    });
  }

  async confirmPayment(input: {
    idempotencyKey: string;
    jobId: string;
    x402Hash: string;
  }): Promise<Payment> {
    return this.withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM payments WHERE idempotency_key = $1 AND job_id = $2 FOR UPDATE`,
        [input.idempotencyKey, input.jobId],
      );
      if (rows.length === 0) throw new Error(`payment not found: ${input.idempotencyKey}`);
      const payment = rowToPayment(rows[0]!);
      if (payment.status === "settled") return payment;
      if (payment.status !== "unresolved") {
        throw new Error(`cannot confirm payment in status ${payment.status}`);
      }
      const updated = await client.query(
        `UPDATE payments SET status = 'settled', x402_hash = $1, updated_at = now()
         WHERE idempotency_key = $2 RETURNING *`,
        [input.x402Hash, input.idempotencyKey],
      );
      return rowToPayment(updated.rows[0]!);
    });
  }

  async releasePayment(input: {
    idempotencyKey: string;
    jobId: string;
  }): Promise<Payment> {
    return this.withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM payments WHERE idempotency_key = $1 AND job_id = $2 FOR UPDATE`,
        [input.idempotencyKey, input.jobId],
      );
      if (rows.length === 0) throw new Error(`payment not found: ${input.idempotencyKey}`);
      const payment = rowToPayment(rows[0]!);
      if (payment.status === "failed") return payment;
      if (payment.status !== "unresolved") {
        throw new Error(`cannot release payment in status ${payment.status}`);
      }
      const updated = await client.query(
        `UPDATE payments SET status = 'failed', updated_at = now()
         WHERE idempotency_key = $1 RETURNING *`,
        [input.idempotencyKey],
      );
      return rowToPayment(updated.rows[0]!);
    });
  }

  async revokeAgent(jobId: string, agentRole: AgentRole): Promise<void> {
    await this.withTx(async (client) => {
      await client.query(
        `INSERT INTO agent_revocations (job_id, agent_role)
         VALUES ($1, $2) ON CONFLICT (job_id, agent_role) DO NOTHING`,
        [jobId, agentRole],
      );
      // Release reserved budget back to the job.
      await client.query(
        `UPDATE reservations SET status = 'released', updated_at = now()
         WHERE job_id = $1 AND agent_role = $2 AND status = 'reserved'`,
        [jobId, agentRole],
      );
      // Unresolved payments from this agent are revoked, not settled.
      await client.query(
        `UPDATE payments SET status = 'revoked', updated_at = now()
         WHERE job_id = $1 AND from_agent = $2 AND status = 'unresolved'`,
        [jobId, agentRole],
      );
    });
  }

  async listPayments(jobId: string): Promise<Payment[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM payments WHERE job_id = $1 ORDER BY created_at ASC, id ASC`,
      [jobId],
    );
    return rows.map(rowToPayment);
  }

  async listReservations(jobId: string): Promise<Reservation[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM reservations WHERE job_id = $1 ORDER BY created_at ASC, id ASC`,
      [jobId],
    );
    return rows.map(rowToReservation);
  }

  /** Read one job (status, description, budget) or null when missing. */
  async getJob(jobId: string): Promise<Job | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM jobs WHERE id = $1`,
      [jobId],
    );
    return rows.length > 0 ? rowToJob(rows[0]!) : null;
  }

  /**
   * List recent jobs, newest first. Public history for the v1 jobs page:
   * no accounts yet, so this is every job in the ledger, capped at
   * `limit` (1–100, default 50). The caller adds per-job totals.
   */
  async listJobs(limit = 50, payerAddress?: string): Promise<Job[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 50));
    if (payerAddress) {
      const { rows } = await this.pool.query(
        `SELECT * FROM jobs WHERE LOWER(payer_address) = LOWER($1) ORDER BY created_at DESC, id DESC LIMIT $2`,
        [payerAddress, safeLimit],
      );
      return rows.map(rowToJob);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT $1`,
      [safeLimit],
    );
    return rows.map(rowToJob);
  }

  /** Move a job through created -> running -> done/failed. */
  async updateJobStatus(jobId: string, status: Job["status"]): Promise<Job> {
    const { rows } = await this.pool.query(
      `UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *`,
      [status, jobId],
    );
    if (rows.length === 0) throw new Error(`job not found: ${jobId}`);
    return rowToJob(rows[0]!);
  }

  /** Save the Weaver's finished brief for a job (once per job). */
  async saveBrief(
    jobId: string,
    brief: { markdown: string; sources: { snippet: string; title: string; url: string }[] },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO job_results (job_id, brief_markdown, sources_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id) DO UPDATE
       SET brief_markdown = EXCLUDED.brief_markdown,
           sources_json = EXCLUDED.sources_json`,
      [jobId, brief.markdown, JSON.stringify(brief.sources)],
    );
  }

  /** Read a job's finished brief, or null when the job has not finished. */
  async getBrief(
    jobId: string,
  ): Promise<{ markdown: string; sources: { snippet: string; title: string; url: string }[] } | null> {
    const { rows } = await this.pool.query(
      `SELECT brief_markdown, sources_json FROM job_results WHERE job_id = $1`,
      [jobId],
    );
    if (rows.length === 0) return null;
    return {
      markdown: rows[0]!.brief_markdown as string,
      sources: JSON.parse(rows[0]!.sources_json as string) as {
        snippet: string;
        title: string;
        url: string;
      }[],
    };
  }
}

// Backwards-compatible stub export, removed in Step 2.
// The old stubLedger threw on reserve(); PostgresLedger replaces it.
export { PostgresLedger as Ledger };

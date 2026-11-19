import { z } from "zod";

/** Money is always integer cents. Never use floating point for money. */
export const amountCentsSchema = z.number().int().nonnegative();

export const agentRoleSchema = z.enum([
  "summoner",
  "seeker",
  "weaver",
  "keeper",
  "warden",
]);

export type AgentRole = z.infer<typeof agentRoleSchema>;

export const paymentStatusSchema = z.enum([
  "settled",
  "reserved",
  "unresolved",
  "failed",
  "revoked",
]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const jobSchema = z.object({
  approvedBudgetCents: amountCentsSchema,
  description: z.string().min(1),
  id: z.string().min(1),
  status: z.enum(["created", "running", "done", "failed"]),
});

export type Job = z.infer<typeof jobSchema>;

export const paymentSchema = z.object({
  amountCents: amountCentsSchema,
  fromAgent: agentRoleSchema,
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  jobId: z.string().min(1),
  status: paymentStatusSchema,
  toAgent: agentRoleSchema,
  x402Hash: z.string().optional(),
});

export type Payment = z.infer<typeof paymentSchema>;

export const reservationStatusSchema = z.enum([
  "reserved",
  "settled",
  "released",
  "revoked",
]);

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const reservationSchema = z.object({
  agentRole: agentRoleSchema,
  amountCents: amountCentsSchema,
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  jobId: z.string().min(1),
  status: reservationStatusSchema,
});

export type Reservation = z.infer<typeof reservationSchema>;

export const ledgerTotalsSchema = z.object({
  approvedBudgetCents: amountCentsSchema,
  reservedCents: amountCentsSchema,
  settledCents: amountCentsSchema,
  unresolvedCents: amountCentsSchema,
});

export type LedgerTotals = z.infer<typeof ledgerTotalsSchema>;

export const ledgerEntrySchema = z.object({
  amountCents: amountCentsSchema,
  id: z.string().min(1),
  jobId: z.string().min(1),
  kind: z.enum(["reservation", "payment"]),
  status: z.union([reservationStatusSchema, paymentStatusSchema]),
  x402Hash: z.string().optional(),
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** Ledger invariant: settled + reserved + unresolved <= approved budget. */
export function ledgerAddsUp(args: {
  approvedBudgetCents: number;
  reservedCents: number;
  settledCents: number;
  unresolvedCents: number;
}): boolean {
  return (
    args.settledCents + args.reservedCents + args.unresolvedCents <=
    args.approvedBudgetCents
  );
}

export function dollarsToCents(dollars: string): number {
  // Parse as integer cents to avoid floating point money errors.
  const [whole = "0", fraction = ""] = dollars.split(".");
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt((fraction + "00").slice(0, 2), 10);
  if (!Number.isInteger(cents) || cents < 0) throw new Error("Invalid amount");
  return cents;
}

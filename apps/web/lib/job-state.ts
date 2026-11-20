import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRole, Job, LedgerTotals, Payment, Reservation } from "@coven/shared";

export interface JobBrief {
  markdown: string;
  sources: { snippet: string; title: string; url: string }[];
}

export interface JobState {
  brief: JobBrief | null;
  job: Job;
  payments: Payment[];
  reservations: Reservation[];
  revoked: AgentRole[];
  totals: LedgerTotals;
}

export async function fetchJobState(jobId: string): Promise<JobState> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("job not found");
  return (await res.json()) as JobState;
}

export async function summonCoven(input: {
  authorizations?: unknown[];
  budgetCents: number;
  job: string;
  payerAddress?: string;
  paymentMode?: "demo" | "user";
}): Promise<{ jobId: string }> {
  const res = await fetch("/api/jobs", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "could not summon a coven");
  }
  return (await res.json()) as { jobId: string };
}

export async function revokeAgent(
  jobId: string,
  agent: AgentRole,
): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/revoke`, {
    body: JSON.stringify({ agent }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) throw new Error("could not revoke agent");
}

/**
 * Live job state for one job page. Loads once, then polls every 2s
 * while the job is still running (created/running). Each job space
 * page (agents / ledger / result) uses this hook on its own — one
 * page, one subscription.
 */
export function useJobState(
  jobId: string,
): { error: string | null; reload: () => Promise<void>; state: JobState | null } {
  const [state, setState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchJobState(jobId);
      setState(next);
    } catch {
      setError("Lost connection to the job. Retrying…");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!state) return;
    const active = state.job.status === "created" || state.job.status === "running";
    if (!active) return;
    pollRef.current = setInterval(() => void load(), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state?.job.status, load]);

  return { error, reload: load, state };
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const MY_JOBS_KEY = "coven:my-jobs";

/**
 * Public v1, no accounts: remember the ids of jobs this browser summoned,
 * so the Jobs page can mark "yours on this device". Anyone with a job
 * link can still view that job — history is public/shareable by link.
 */
export function rememberMyJob(jobId: string): void {
  if (typeof window === "undefined") return;
  try {
    const mine = readMyJobs();
    if (!mine.includes(jobId)) {
      window.localStorage.setItem(
        MY_JOBS_KEY,
        JSON.stringify([jobId, ...mine].slice(0, 50)),
      );
    }
  } catch {
    // localStorage unavailable — history still works via the share link.
  }
}

export function readMyJobs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_JOBS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export const EXPLORER_TX = (hash: string) =>
  `https://base-sepolia.blockscout.com/tx/${hash}`;

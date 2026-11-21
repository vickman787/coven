"use client";

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

export { dollars, EXPLORER_TX } from "./money";

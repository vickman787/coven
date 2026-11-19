import type { AgentRole } from "@coven/shared";

export interface ResearchSource {
  snippet: string;
  title: string;
  url: string;
}

export interface ResearchProvider {
  name: string;
  search(query: string): Promise<ResearchSource[]>;
}

export interface Brief {
  markdown: string;
  sources: ResearchSource[];
}

export interface AgentContext {
  budgetCents: number;
  jobDescription: string;
  jobId: string;
}

export interface AgentResult {
  agent: AgentRole;
  detail: string;
  ok: boolean;
}

export interface PaymentExecutor {
  pay(input: {
    amountCents: number;
    description: string;
  }): Promise<{ reason?: string; status: "settled" | "unresolved"; txHash?: string }>;
}

export interface JobRunResult {
  brief: Brief | null;
  jobId: string;
  payments: {
    amountCents: number;
    fromAgent: AgentRole;
    reason?: string;
    status: string;
    toAgent: AgentRole;
    txHash?: string;
  }[];
  status: "done" | "failed";
  totals: {
    approvedBudgetCents: number;
    reservedCents: number;
    settledCents: number;
    unresolvedCents: number;
  };
}

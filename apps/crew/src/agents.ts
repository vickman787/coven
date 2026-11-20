import { allocateBudget, ledgerAddsUp } from "@coven/shared";
import type { AgentRole } from "@coven/shared";
import type { Brief, ResearchProvider, ResearchSource } from "./types.js";
import { researchJob } from "./research.js";

/**
 * The 5 Kiro Crew agents.
 *
 * - Summoner: takes the job, splits the budget into scoped allocations.
 * - Seeker: researches the job with a real provider (Wikipedia).
 * - Weaver: writes the one-page brief from the sources the Seeker found.
 * - Keeper: holds the ledger (reserving and paying live in run-job.ts).
 * - Warden: verifies each step and revokes a failing agent.
 *
 * Agents never invent sources or claims. The brief only cites what the
 * Seeker actually fetched.
 */

/** Summoner: split the budget across agents, proportionally, in cents. */
export function summonerAllocate(
  budgetCents: number,
): { agent: AgentRole; amountCents: number }[] {
  return allocateBudget(budgetCents);
}

/** Seeker: research the job. Returns the sources found, deduped. */
export async function seekerResearch(
  provider: ResearchProvider,
  jobDescription: string,
): Promise<ResearchSource[]> {
  return researchJob(provider, jobDescription);
}

/** Weaver: write a one-page brief from real sources only. */
export function weaverWriteBrief(
  jobDescription: string,
  sources: ResearchSource[],
): Brief {
  const findings = sources
    .map((s) => `- **${s.title}** — ${s.snippet} (Source: ${s.url})`)
    .join("\n");
  const sourceList = sources
    .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
    .join("\n");
  const markdown = [
    `# Competitor Brief`,
    ``,
    `Job: ${jobDescription}`,
    ``,
    `## Summary`,
    ``,
    `This brief is based on ${sources.length} source(s) found by the Seeker. ` +
      `Every claim below cites a source; nothing here is invented.`,
    ``,
    `## Findings`,
    ``,
    findings || `- No sources were found for this job.`,
    ``,
    `## Sources`,
    ``,
    sourceList || `None.`,
    ``,
  ].join("\n");
  return { markdown, sources };
}

/** Warden: verify the brief and the ledger. Returns a reason when it fails. */
export function wardenVerify(input: {
  brief: Brief | null;
  totals: {
    approvedBudgetCents: number;
    reservedCents: number;
    settledCents: number;
    unresolvedCents: number;
  };
}): { ok: boolean; reason?: string } {
  if (!input.brief) return { ok: false, reason: "no brief was produced" };
  if (input.brief.sources.length === 0) {
    return { ok: false, reason: "brief has no sources" };
  }
  if (!input.brief.markdown.includes("## Sources")) {
    return { ok: false, reason: "brief has no sources section" };
  }
  if (
    !ledgerAddsUp({
      approvedBudgetCents: input.totals.approvedBudgetCents,
      reservedCents: input.totals.reservedCents,
      settledCents: input.totals.settledCents,
      unresolvedCents: input.totals.unresolvedCents,
    })
  ) {
    return { ok: false, reason: "ledger invariant broken" };
  }
  return { ok: true };
}

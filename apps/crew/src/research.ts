import type { ResearchProvider, ResearchSource } from "./types.js";

const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "to", "for", "on", "in", "with", "write",
  "research", "one-page", "one", "page", "brief", "report", "summary",
  "please", "me", "us", "our", "your", "is", "are", "by", "at", "from",
]);

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Derive up to 3 search queries from a job description.
 * The full cleaned description first, then the top keywords.
 */
export function deriveQueries(jobDescription: string): string[] {
  const cleaned = jobDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    // Drop purely numeric tokens ("10", "1"): searching Wikipedia for a
    // bare number returns junk pages (the page for "10", "1", "10-10-321").
    // Drop short tokens from the single-word fallback below for the same
    // reason ("ai" alone returns AI-slop pages, not the job's topic).
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const unique = [...new Set(cleaned)];
  const queries: string[] = [];
  if (unique.length > 0) queries.push(unique.join(" "));
  if (unique.length >= 3) queries.push(unique.slice(0, 3).join(" "));
  // Single-word fallback: first real word (>= 4 chars), never a number or
  // a 2-letter token. Only used when it adds a distinct query.
  const fallback = unique.find((w) => w.length >= 4);
  if (fallback) queries.push(fallback);
  return [...new Set(queries)].slice(0, 3);
}

/** Real research provider: Wikipedia search API. No key needed. */
export class WikipediaProvider implements ResearchProvider {
  name = "wikipedia";

  constructor(private fetchFn: typeof fetch = fetch) {}

  async search(query: string): Promise<ResearchSource[]> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
    const res = await this.fetchFn(url, {
      headers: { "user-agent": "Coven/0.1 (Kiroween 2026 demo; contact: coven demo)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Wikipedia search failed: ${res.status}`);
    const data = (await res.json()) as {
      query?: { search?: { snippet: string; title: string }[] };
    };
    return (data.query?.search ?? []).map((r) => ({
      snippet: stripHtml(r.snippet),
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    }));
  }
}

/** Search every derived query and dedupe sources by URL, capped at 10. */
export async function researchJob(
  provider: ResearchProvider,
  jobDescription: string,
): Promise<ResearchSource[]> {
  const queries = deriveQueries(jobDescription);
  const seen = new Map<string, ResearchSource>();
  for (const query of queries) {
    const results = await provider.search(query);
    for (const source of results) {
      if (!seen.has(source.url)) seen.set(source.url, source);
      if (seen.size >= 10) break;
    }
    if (seen.size >= 10) break;
  }
  return [...seen.values()];
}

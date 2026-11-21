import { describe, expect, it } from "vitest";
import { deriveQueries, researchJob, WikipediaProvider } from "./research.js";

describe("deriveQueries", () => {
  it("derives queries from a job description", () => {
    const queries = deriveQueries(
      "research 10 competitors and write a one-page brief",
    );
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]).toBe("competitors");
  });

  it("never derives a bare-number or bare-short-token query", () => {
    // Regression: "10" and "ai" alone used to be searched on Wikipedia
    // and returned junk pages (the page for "10", "AI slop").
    expect(deriveQueries("research 10 competitors and write a one-page brief")).not.toContain("10");
    const aiQueries = deriveQueries(
      "research 10 AI note-taking apps and write a one-page brief",
    );
    expect(aiQueries).not.toContain("10");
    expect(aiQueries).not.toContain("ai");
    expect(aiQueries[0]).toBe("ai note-taking apps");
    expect(aiQueries).toContain("note-taking");
    // A job that is only a number yields no queries: the job then fails
    // honestly with no sources instead of returning junk.
    expect(deriveQueries("research 10")).toEqual([]);
  });
});

describe("WikipediaProvider with mocked fetch", () => {
  it("parses search results into sources with real URLs", async () => {
    const fetchFn = (async () => {
      return new Response(
        JSON.stringify({
          query: {
            search: [
              { snippet: "Acme <b>corp</b>", title: "Acme Corporation" },
              { snippet: "Beta Ltd", title: "Beta" },
            ],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const provider = new WikipediaProvider(fetchFn);
    const results = await provider.search("competitors");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      snippet: "Acme corp",
      title: "Acme Corporation",
      url: "https://en.wikipedia.org/wiki/Acme_Corporation",
    });
  });

  it("researchJob dedupes sources across queries", async () => {
    const fetchFn = (async () => {
      return new Response(
        JSON.stringify({
          query: { search: [{ snippet: "x", title: "Same" }] },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const sources = await researchJob(new WikipediaProvider(fetchFn), "competitors");
    expect(sources).toHaveLength(1);
  });
});

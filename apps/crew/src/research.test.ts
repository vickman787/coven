import { describe, expect, it } from "vitest";
import { deriveQueries, researchJob, WikipediaProvider } from "./research.js";

describe("deriveQueries", () => {
  it("derives queries from a job description", () => {
    const queries = deriveQueries(
      "research 10 competitors and write a one-page brief",
    );
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]).toBe("10 competitors");
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

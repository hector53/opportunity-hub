import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gobJobSchema, gobSearchResponseSchema, mapGobJob } from "@/server/connectors/getonboard/mapper";

// Synthetic fixture (fictional companies) that mirrors the shape of the public API response
// (GET /api/v0/search/jobs with expand=company,tags,modality,seniority), verified against the live API on 2026-10-09.
const fixture = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/gob-search.json"), "utf8"));

describe("Get on Board mapper", () => {
  it("parses the real search response", () => {
    const res = gobSearchResponseSchema.parse(fixture);
    expect(res.data.length).toBeGreaterThan(0);
    for (const item of res.data) expect(gobJobSchema.safeParse(item).success).toBe(true);
  });

  it("maps a job to a normalized opportunity with provenance and original link", () => {
    const job = gobJobSchema.parse(fixture.data[0]);
    const n = mapGobJob(job);
    expect(n.sourceKey).toBe("getonboard");
    expect(n.ingestionMethod).toBe("api");
    expect(n.externalId).toBe(job.id);
    expect(n.originalUrl).toMatch(/^https:\/\/www\.getonbrd\.com\/jobs\//);
    expect(n.title.length).toBeGreaterThan(0);
    expect(n.description).not.toMatch(/<[a-z]+>/i);
    expect(n.provenance.title?.kind).toBe("source");
    if (n.budgetMin != null) expect(n.budgetPeriod).toBe("month");
    else expect(n.budgetPeriod).toBe("unknown");
    expect(n.isDemo).toBe(false);
  });

  it("tolerates missing optional fields", () => {
    const n = mapGobJob(gobJobSchema.parse({ id: "x", type: "job", attributes: { title: "Dev" } }));
    expect(n.company).toBeNull();
    expect(n.budgetMin).toBeNull();
    expect(n.engagementType).toBe("unknown");
    expect(n.originalUrl).toBe("https://www.getonbrd.com/jobs/x");
  });
});

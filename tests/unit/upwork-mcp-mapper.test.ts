import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapUpworkMcpJob, upworkMcpJobSchema } from "@/server/connectors/upwork/mcp-mapper";
import { assertAllowedUpworkMcpDiscoveryTool, isAllowedUpworkMcpDiscoveryTool } from "@/server/connectors/upwork/mcp-policy";

const fixture = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/upwork-mcp-search.json"), "utf8"));

describe("Upwork MCP discovery PoC", () => {
  it("parses a search row and maps it to the existing normalized contract", () => {
    const job = upworkMcpJobSchema.parse(fixture);
    const normalized = mapUpworkMcpJob(job);

    expect(normalized.sourceKey).toBe("upwork");
    expect(normalized.ingestionMethod).toBe("mcp");
    expect(normalized.externalId).toBe("synthetic-upwork-job-001");
    expect(normalized.originalUrl).toBe("https://upwork.com/jobs/~02synthetic001");
    expect(normalized.description).not.toContain("untrusted_participant_content");
    expect(normalized.skills).toEqual(expect.arrayContaining(["typescript", "react", "postgresql"]));
    expect(normalized.budgetMin).toBe(40);
    expect(normalized.budgetMax).toBe(60);
    expect(normalized.budgetPeriod).toBe("hour");
    expect(normalized.budgetCurrency).toBeNull();
    expect(normalized.provenance.budget?.note).toMatch(/no expone un campo de moneda/i);
    expect(normalized.rawPayload).toBeNull();
  });

  it("keeps missing search data unknown instead of inventing a company or location", () => {
    const normalized = mapUpworkMcpJob({ id: "minimal", title: "Synthetic job", url: "https://www.upwork.com/jobs/~02minimal" });
    expect(normalized.company).toBeNull();
    expect(normalized.location).toBeNull();
    expect(normalized.remote).toBeNull();
    expect(normalized.budgetMin).toBeNull();
    expect(normalized.confidence).toBe("medium");
  });

  it("rejects non-HTTP(S) source URLs before they reach the pipeline", () => {
    expect(() => mapUpworkMcpJob({ id: "unsafe", title: "Synthetic job", url: "javascript:alert(1)" })).toThrow(/URL no HTTP/i);
  });

  it("allows only account selection and read-only job discovery tools", () => {
    expect(isAllowedUpworkMcpDiscoveryTool("list_accounts")).toBe(true);
    expect(isAllowedUpworkMcpDiscoveryTool("find_jobs")).toBe(true);
    expect(isAllowedUpworkMcpDiscoveryTool("manage_proposals")).toBe(false);
    expect(() => assertAllowedUpworkMcpDiscoveryTool("send_message")).toThrow(/allowlist/i);
  });
});

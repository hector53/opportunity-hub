import { describe, expect, it } from "vitest";
import { EXPIRED_UPWORK_TITLE, isUpworkContentExpired, redactedUpworkOpportunityFields } from "@/server/connectors/upwork/retention-policy";

describe("Upwork retention policy", () => {
  it("expires at the provider-safe boundary", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(isUpworkContentExpired(new Date("2026-10-14T11:59:59Z"), now)).toBe(true);
    expect(isUpworkContentExpired(new Date("2026-10-14T12:00:01Z"), now)).toBe(false);
    expect(isUpworkContentExpired(null, now)).toBe(false);
  });

  it("does not leave source fragments, identifiers, scores or URLs in the redacted shell", () => {
    const fields = redactedUpworkOpportunityFields("opportunity-1");
    expect(fields.title).toBe(EXPIRED_UPWORK_TITLE);
    expect(fields.description).toBe("");
    expect(fields.externalId).toBeNull();
    expect(fields.originalUrl).toBeNull();
    expect(fields.skills).toEqual([]);
    expect(fields.overallScore).toBeNull();
    expect(fields.provenance.retention.kind).toBe("source");
    expect(JSON.stringify(fields)).not.toContain("Senior Full-Stack Engineer");
  });
});

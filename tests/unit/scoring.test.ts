import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/features/settings/types";
import { scoreOpportunity, type ScoringInput } from "@/server/scoring/engine";

const base: ScoringInput = {
  title: "",
  description: "",
  skills: [],
  clientType: "unknown",
  sector: null,
  engagementType: "unknown",
  budgetMin: null,
  budgetMax: null,
  budgetCurrency: null,
  budgetPeriod: "unknown",
  hoursPerWeek: null,
  durationText: null,
  seniority: null,
  language: null,
  remote: null,
  remoteModality: null,
  countries: [],
  location: null,
  competitorCount: null,
};

const good: ScoringInput = {
  ...base,
  title: "Senior Full-Stack Engineer (Next.js / Node)",
  description:
    "I'm the founder of a B2B SaaS. Long-term, ongoing work with a clear roadmap. Stack: TypeScript, React, Next.js, Node.js, PostgreSQL, WebSockets. 20 hours per week. Remote, LATAM welcome. ".repeat(3),
  skills: ["typescript", "react", "postgresql"],
  clientType: "founder",
  sector: "saas",
  engagementType: "fractional",
  budgetMin: 40,
  budgetMax: 50,
  budgetCurrency: "USD",
  budgetPeriod: "hour",
  hoursPerWeek: 20,
  language: "en",
  remote: true,
  competitorCount: 8,
};

describe("deterministic scoring", () => {
  it("scores a well-matched fractional founder opportunity high, with reasons", () => {
    const r = scoreOpportunity(good, DEFAULT_SETTINGS);
    expect(r.overall).toBeGreaterThanOrEqual(75);
    expect(r.tech.score).toBeGreaterThanOrEqual(80);
    expect(r.client.reasons.length).toBeGreaterThan(0);
    expect(r.commercial.reasons.some((x) => x.text.includes("objetivo"))).toBe(true);
  });

  it("marks dimensions as Unknown (null) instead of inventing them", () => {
    const r = scoreOpportunity({ ...base, title: "Developer needed" }, DEFAULT_SETTINGS);
    expect(r.tech.score).toBeNull();
    expect(r.client.score).toBeNull();
    expect(r.commercial.score).toBeNull();
    expect(r.practical.score).toBeNull();
    expect(r.overall).toBeNull();
    expect(r.client.unknowns.length).toBeGreaterThan(0);
  });

  it("penalizes unfamiliar primary tech, low rate, onsite and geo restrictions", () => {
    const r = scoreOpportunity(
      {
        ...base,
        title: "Java Spring Developer",
        description: "Must be located in the US. Onsite. 10+ years of Java experience required. Pay $15/hour.",
        skills: ["java"],
        budgetMin: 15,
        budgetMax: 15,
        budgetCurrency: "USD",
        budgetPeriod: "hour",
        remote: false,
        language: "en",
      },
      DEFAULT_SETTINGS,
    );
    expect(r.tech.score!).toBeLessThan(40);
    expect(r.commercial.score!).toBeLessThan(40);
    expect(r.practical.score!).toBeLessThan(30);
  });

  it("respects configurable weights", () => {
    const zeroTech = { ...DEFAULT_SETTINGS, scoring: { ...DEFAULT_SETTINGS.scoring, weights: { tech: 0, client: 1, commercial: 0, practical: 0 } } };
    const r = scoreOpportunity(good, zeroTech);
    expect(r.overall).toBe(r.client.score);
  });

  it("does not convert non-USD budgets silently", () => {
    const r = scoreOpportunity({ ...good, budgetCurrency: "EUR" }, DEFAULT_SETTINGS);
    expect(r.commercial.unknowns.join(" ")).toContain("EUR");
  });

  it("takes the home location from the profile, not from code", () => {
    const input = { ...base, title: "Dev", description: "Remote role, candidates must be based in Uruguay. ".repeat(4), remote: true, language: "en" };
    const plain = scoreOpportunity(input, DEFAULT_SETTINGS);
    const uy = scoreOpportunity(input, { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, location: "Uruguay (remote)" } });
    expect(uy.practical.score!).toBeGreaterThan(plain.practical.score!);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings } from "@/features/settings/types";
import { assessEligibility, homePlaces, type EligibilityInput } from "@/server/scoring/eligibility";
import { confidenceFor, scoreCommercial, scoreOpportunity, type ScoringInput } from "@/server/scoring/engine";

// Fictional profile located in Uruguay (LATAM). Nothing about the real user is used.
const settings: AppSettings = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, location: "Montevideo, Uruguay (remote)" } };
const base: EligibilityInput = { title: "Senior Engineer", description: "", remote: null, remoteModality: null, countries: [], location: null };
const status = (i: Partial<EligibilityInput>) => assessEligibility({ ...base, ...i }, settings).status;

describe("geographic eligibility", () => {
  it("derives home places from the profile", () => {
    const h = homePlaces(settings);
    expect(h.terms).toContain("uruguay");
    expect(h.latam).toBe(true);
  });

  it("fully_remote without restrictions is eligible", () => {
    expect(status({ remote: true, remoteModality: "fully_remote" })).toBe("eligible");
  });

  it("remote_local without information needs review (not ineligible)", () => {
    expect(status({ remote: true, remoteModality: "remote_local", countries: ["Remote"] })).toBe("needs_review");
  });

  it("remote_local that explicitly includes LATAM or the home country is eligible", () => {
    expect(status({ remote: true, remoteModality: "remote_local", description: "Fully remote; candidates must live in Latin America." })).toBe("eligible");
    expect(status({ remote: true, remoteModality: "remote_local", countries: ["Chile", "Uruguay"] })).toBe("eligible");
  });

  it("explicit exclusions make it ineligible", () => {
    expect(status({ remote: true, remoteModality: "fully_remote", description: "Remote, but you must be located in the United States." })).toBe("ineligible");
    expect(status({ remote: true, description: "US-only position." })).toBe("ineligible");
    expect(status({ remote: true, description: "Solo para residentes en España." })).toBe("ineligible");
    expect(status({ remote: true, description: "Must be authorized to work in the US." })).toBe("ineligible");
  });

  it("restrictions that include the home region stay eligible", () => {
    expect(status({ remote: true, description: "You must be based in the US or LATAM." })).toBe("eligible");
    expect(status({ remote: true, description: "Work from anywhere." })).toBe("eligible");
  });

  it("onsite and hybrid elsewhere are ineligible; in the home country they need review", () => {
    expect(status({ remote: false, location: "Bogotá, Colombia" })).toBe("ineligible");
    expect(status({ remote: true, remoteModality: "hybrid", location: "Madrid" })).toBe("ineligible");
    expect(status({ remote: false, location: "Montevideo, Uruguay" })).toBe("needs_review");
    expect(status({ remote: false })).toBe("needs_review");
  });

  it("missing information is needs_review, never ineligible", () => {
    expect(status({})).toBe("needs_review");
    expect(status({ description: "Great team, interesting product." })).toBe("needs_review");
  });

  it("timezone overlap requirements don't exclude by themselves", () => {
    const r = assessEligibility({ ...base, remote: true, remoteModality: "fully_remote", description: "4 hours overlap with EST required" }, settings);
    expect(r.status).toBe("eligible");
    expect(r.reasons.some((x) => x.text.includes("solapamiento"))).toBe(true);
  });
});

const scoring: ScoringInput = {
  title: "Full-Stack Engineer (React/Node)",
  description: "Build a B2B SaaS with TypeScript, React, Node.js and PostgreSQL. Long-term roadmap. ".repeat(6),
  skills: ["react", "typescript"],
  clientType: "startup",
  sector: "saas",
  engagementType: "contract",
  budgetMin: 40,
  budgetMax: 50,
  budgetCurrency: "USD",
  budgetPeriod: "hour",
  hoursPerWeek: 20,
  durationText: null,
  seniority: null,
  language: "en",
  remote: true,
  remoteModality: "fully_remote",
  countries: [],
  location: null,
  competitorCount: 5,
};

describe("score confidence", () => {
  it("is high only with four known dimensions and resolved eligibility", () => {
    const r = scoreOpportunity(scoring, settings);
    expect(r.confidence).toBe("high");
    expect(confidenceFor({ tech: 80, client: 70, commercial: 70, practical: 70 }, "needs_review")).toBe("medium");
    expect(confidenceFor({ tech: 80, client: null, commercial: 70, practical: 70 }, "eligible")).toBe("medium");
    expect(confidenceFor({ tech: 80, client: null, commercial: null, practical: 70 }, "eligible")).toBe("low");
    expect(confidenceFor({ tech: null, client: 90, commercial: 90, practical: 90 }, "eligible")).toBe("low");
  });

  it("a high score built on little information is low confidence", () => {
    const r = scoreOpportunity({ ...scoring, clientType: "unknown", sector: null, competitorCount: null, budgetMin: null, budgetMax: null, budgetCurrency: null, engagementType: "unknown", hoursPerWeek: null, description: "React Node TypeScript" }, settings);
    expect(r.confidence).toBe("low");
  });
});

describe("commercial fit — no implicit currency conversion", () => {
  it("does not judge a fixed budget in another currency against configured thresholds", () => {
    const eur = scoreCommercial({ ...scoring, budgetMin: 200, budgetMax: 200, budgetCurrency: "EUR", budgetPeriod: "fixed" }, settings);
    expect(eur.reasons.some((r) => r.text.includes("Presupuesto fijo"))).toBe(false);
    expect(eur.unknowns.join(" ")).toContain("EUR");
    const usd = scoreCommercial({ ...scoring, budgetMin: 200, budgetMax: 200, budgetCurrency: "USD", budgetPeriod: "fixed" }, settings);
    expect(usd.reasons.some((r) => r.text.includes("Presupuesto fijo muy bajo"))).toBe(true);
  });

  it("treats a budget without currency as not comparable", () => {
    const r = scoreCommercial({ ...scoring, budgetCurrency: null }, settings);
    expect(r.reasons.some((x) => x.text.startsWith("Tarifa"))).toBe(false);
    expect(r.unknowns.join(" ")).toContain("sin moneda");
  });

  it("respects a non-USD configured currency", () => {
    const eurSettings = { ...settings, preferences: { ...settings.preferences, currency: "EUR" } };
    const r = scoreCommercial({ ...scoring, budgetCurrency: "EUR" }, eurSettings);
    expect(r.reasons.some((x) => x.text.startsWith("Tarifa ≥ objetivo"))).toBe(true);
  });
});

describe("LATAM mentions need a location context", () => {
  it("doesn't treat a market mention as eligibility", () => {
    expect(status({ remote: true, remoteModality: "remote_local", description: "We sell software to banks in LATAM and Europe." })).toBe("needs_review");
    expect(status({ remote: true, remoteModality: "remote_local", description: "We hire remote talent across LATAM." })).toBe("eligible");
  });
});

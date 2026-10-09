import { describe, expect, it } from "vitest";
import { dedupeKeyFor, fingerprintFor } from "@/server/deduplication/keys";
import { getOnBoardIdFromUrl, normalizeManualImport } from "@/server/connectors/manual/import";

const base = { sourceKey: "workana", externalId: null, originalUrl: null, title: "Build an MVP", description: "desc", company: { name: "ACME Inc." } };

describe("dedupe keys", () => {
  it("prefers external id", () => {
    expect(dedupeKeyFor({ ...base, sourceKey: "getonboard", externalId: "abc" })).toBe("getonboard:id:abc");
  });
  it("uses canonical URL so tracking params do not create duplicates", () => {
    const a = dedupeKeyFor({ ...base, originalUrl: "https://www.workana.com/job/x?utm_source=mail" });
    const b = dedupeKeyFor({ ...base, originalUrl: "https://workana.com/job/x/" });
    expect(a).toBe(b);
  });
  it("falls back to content hash and is stable", () => {
    expect(dedupeKeyFor(base)).toBe(dedupeKeyFor({ ...base }));
    expect(dedupeKeyFor(base)).not.toBe(dedupeKeyFor({ ...base, description: "other" }));
  });
  it("fingerprint ignores company suffixes and case", () => {
    expect(fingerprintFor({ title: "Build an MVP", company: { name: "ACME Inc." } })).toBe(fingerprintFor({ title: "build an mvp!", company: { name: "Acme" } }));
  });
  it("maps Get on Board URLs to the API id so manual and synced items dedupe", () => {
    expect(getOnBoardIdFromUrl("https://www.getonbrd.com/jobs/programming/senior-dev-acme-remote")).toBe("senior-dev-acme-remote");
    expect(getOnBoardIdFromUrl("https://www.getonbrd.com/jobs/senior-dev-acme-remote?utm=1")).toBe("senior-dev-acme-remote");
    const n = normalizeManualImport({ sourceKey: "getonboard", title: "Senior dev", description: "", url: "https://www.getonbrd.com/jobs/senior-dev-acme-remote" });
    expect(dedupeKeyFor(n)).toBe("getonboard:id:senior-dev-acme-remote");
  });
});

describe("manual import provenance", () => {
  it("marks explicit fields as manual and guesses as inferred", () => {
    const n = normalizeManualImport({
      sourceKey: "workana",
      title: "Chatbot IA",
      description: "Somos una agencia digital. Presupuesto USD 1500 fijo. Proyecto remoto.",
      language: "es",
    });
    expect(n.provenance.language?.kind).toBe("manual");
    expect(n.provenance.budget?.kind).toBe("inferred");
    expect(n.budgetPeriod).toBe("fixed");
    expect(n.clientType).toBe("agency");
    expect(n.provenance.clientType?.kind).toBe("inferred");
    expect(n.remote).toBe(true);
  });
  it("leaves absent data as unknown instead of inventing it", () => {
    const n = normalizeManualImport({ sourceKey: "upwork", title: "Help needed", description: "" });
    expect(n.clientType).toBe("unknown");
    expect(n.budgetMin).toBeNull();
    expect(n.language).toBeNull();
    expect(n.confidence).toBe("low");
  });
});

import { preserveManualEdits } from "@/server/ingestion/merge";

describe("re-sync preserves manual edits", () => {
  it("keeps user-edited budget and client type, accepts other source updates", () => {
    const existing = {
      budgetMin: 40, budgetMax: 50, budgetCurrency: "USD", budgetPeriod: "hour", clientType: "founder", title: "Old",
      provenance: { budget: { kind: "manual" as const }, clientType: { kind: "manual" as const }, title: { kind: "source" as const } },
    };
    const incoming = {
      budgetMin: 3000, budgetMax: 4000, budgetCurrency: "USD", budgetPeriod: "month", clientType: "agency", title: "New",
      provenance: { budget: { kind: "source" as const }, title: { kind: "source" as const } },
    };
    const r = preserveManualEdits(existing, incoming);
    expect(r).toMatchObject({ budgetMin: 40, budgetPeriod: "hour", clientType: "founder", title: "New" });
    expect(r.provenance.budget?.kind).toBe("manual");
  });
});

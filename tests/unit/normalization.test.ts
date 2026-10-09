import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  extractSkills,
  htmlToText,
  inferClientType,
  inferEngagement,
  inferHoursPerWeek,
  normalizeUrl,
  parseBudgetFromText,
  toHourly,
} from "@/server/normalization/text";

describe("htmlToText", () => {
  it("strips tags and scripts, decodes entities, keeps list structure", () => {
    const t = htmlToText('<p>Hello &amp; welcome</p><script>alert(1)</script><ul><li>One</li><li>Two</li></ul>');
    expect(t).toContain("Hello & welcome");
    expect(t).not.toContain("alert");
    expect(t).toContain("• One");
  });
});

describe("normalizeUrl", () => {
  it("removes tracking params, hash, www and trailing slash", () => {
    expect(normalizeUrl("http://www.Example.com/jobs/1/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/jobs/1?a=1&b=2");
  });
  it("rejects non-http schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("budget parsing", () => {
  it("parses hourly ranges", () => {
    const b = parseBudgetFromText("Budget: $30 - $45 per hour");
    expect(b).toMatchObject({ min: 30, max: 45, currency: "USD", period: "hour" });
  });
  it("parses Spanish monthly", () => {
    expect(parseBudgetFromText("Pago USD 3.000 al mes").period).toBe("month");
  });
  it("returns unknown when there is no currency marker", () => {
    expect(parseBudgetFromText("pay is 40 per hour").min).toBeNull();
  });
  it("converts to hourly", () => {
    expect(toHourly(4800, "month")).toBe(30);
    expect(toHourly(1000, "fixed")).toBeNull();
    expect(toHourly(null, "hour")).toBeNull();
  });
});

describe("inference", () => {
  it("detects language", () => {
    expect(detectLanguage("Buscamos un desarrollador con experiencia para el proyecto de la empresa que necesitamos")).toBe("es");
    expect(detectLanguage("We are looking for a developer with experience for our project and we will need you")).toBe("en");
    expect(detectLanguage("short")).toBeNull();
  });
  it("infers engagement and hours", () => {
    expect(inferEngagement("Fractional CTO role").value).toBe("fractional");
    expect(inferEngagement("Trabajo de tiempo completo").value).toBe("full_time");
    expect(inferHoursPerWeek("around 20-30 hours per week")).toBe(25);
  });
  it("infers client type from explicit statements only", () => {
    expect(inferClientType("I'm the founder of a small SaaS").value).toBe("founder");
    expect(inferClientType("We use Visual Studio Code").value).toBe("unknown");
    expect(inferClientType("Join us", "Leading staffing company").value).toBe("recruiter");
    expect(inferClientType("Our client is a fintech").value).toBe("recruiter");
  });
  it("extracts technology skills with sensible boundaries", () => {
    const s = extractSkills("We use Node.js, React and PostgreSQL. Experience with .NET is a plus. Let's go live soon.");
    expect(s).toEqual(expect.arrayContaining(["node.js", "react", "postgresql", ".net"]));
    expect(s).not.toContain("go");
  });
});

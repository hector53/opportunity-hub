import { describe, expect, it } from "vitest";
import { allowedTransitions, APPLICATION_STATUSES, canTransition } from "@/features/applications/state-machine";

describe("application state machine", () => {
  it("allows the main pipeline in order", () => {
    const path = ["saved", "draft", "applied", "replied", "interview", "offer", "hired"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("rejects invalid jumps", () => {
    expect(canTransition("saved", "hired")).toBe(false);
    expect(canTransition("draft", "interview")).toBe(false);
    expect(canTransition("archived", "hired")).toBe(false);
  });
  it("every state can reach archived or is archived", () => {
    for (const s of APPLICATION_STATUSES) {
      if (s !== "archived") expect(allowedTransitions(s)).toContain("archived");
    }
  });
});

import { funnel, rateBucket } from "@/features/experiments/stats";

describe("experiment funnel", () => {
  it("only counts sent applications and flags small samples", () => {
    const rows = funnel(
      [
        { status: "saved", v: "A" },
        { status: "applied", v: "A" },
        { status: "replied", v: "A" },
        { status: "interview", v: "B" },
        { status: "hired", v: "B" },
      ],
      (x) => x.v,
    );
    const a = rows.find((r) => r.key === "A")!;
    const b = rows.find((r) => r.key === "B")!;
    expect(a.sent).toBe(2);
    expect(a.responseRate).toBe(50);
    expect(b.interviewRate).toBe(100);
    expect(b.hired).toBe(1);
    expect(a.smallSample).toBe(true);
  });
  it("buckets hourly rates", () => {
    expect(rateBucket(35, "hour")).toBe("$30–39/h");
    expect(rateBucket(2000, "fixed")).toBe("sin tarifa/h");
  });
});

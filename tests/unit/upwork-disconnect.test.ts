import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const purgeCachedUpworkContent = vi.fn();
  const findFirst = vi.fn();
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const release = vi.fn();
  const lockConnection = Object.assign(vi.fn().mockResolvedValue([]), { release });
  const reserve = vi.fn().mockResolvedValue(lockConnection);
  return { purgeCachedUpworkContent, findFirst, where, set, update, release, reserve };
});

vi.mock("drizzle-orm", () => ({ eq: vi.fn((left, right) => ({ left, right })) }));
vi.mock("@/server/connectors/upwork/retention", () => ({ purgeCachedUpworkContent: mocks.purgeCachedUpworkContent }));
vi.mock("@/server/db/client", () => ({
  db: { query: { upworkConnections: { findFirst: mocks.findFirst } }, update: mocks.update },
  schema: { upworkConnections: { id: "upwork_connections.id" }, sources: { key: "sources.key", status: "sources.status" } },
  sqlClient: { reserve: mocks.reserve },
}));

import { disconnectUpwork } from "@/server/connectors/upwork/token-store";

describe("Upwork disconnect coordination", () => {
  it("purges cached content even when tokens are already absent, while holding the shared lock", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.purgeCachedUpworkContent.mockResolvedValue(3);

    await expect(disconnectUpwork()).resolves.toEqual({ remoteRevoked: true, redacted: 3 });
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.purgeCachedUpworkContent).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";
import { syncGetOnBoard } from "@/server/connectors/getonboard/sync";
import { rescoreStale } from "@/server/services/rescore";

const TICK_MS = 5 * 60 * 1000;
const g = globalThis as unknown as { __ohScheduler?: NodeJS.Timeout };

/** Checks every 5 minutes whether a scheduled Get on Board sync is due. Concurrency is guarded by an advisory lock. */
export function startScheduler() {
  if (g.__ohScheduler) return;
  const tick = async () => {
    try {
      const rescored = await rescoreStale();
      if (rescored) console.log(`[scheduler] re-scored ${rescored} opportunities with the current scoring version`);
    } catch (e) {
      console.error("[scheduler] rescore failed", e instanceof Error ? e.message : e);
    }
    try {
      const settings = await getSettings();
      const cfg = settings.sync.getonboard;
      if (!cfg.enabled) return;
      const source = await db.query.sources.findFirst({ where: eq(schema.sources.key, "getonboard") });
      if (!source || source.status === "disabled") return;
      const last = source.lastRunAt?.getTime() ?? 0;
      if (Date.now() - last < cfg.intervalMinutes * 60 * 1000) return;
      const r = await syncGetOnBoard("schedule");
      console.log(`[scheduler] ${r.message}`);
    } catch (e) {
      console.error("[scheduler] tick failed", e instanceof Error ? e.message : e);
    }
  };
  // First check shortly after boot, then periodically.
  setTimeout(tick, 60 * 1000).unref();
  g.__ohScheduler = setInterval(tick, TICK_MS);
  g.__ohScheduler.unref();
  console.log("[scheduler] started (Get on Board)");
}

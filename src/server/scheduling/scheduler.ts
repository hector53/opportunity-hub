import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";
import { syncGetOnBoard } from "@/server/connectors/getonboard/sync";
import { rescoreStale } from "@/server/services/rescore";
import { purgeExpiredUpworkContent } from "@/server/connectors/upwork/retention";

const TICK_MS = 5 * 60 * 1000;
const g = globalThis as unknown as { __ohScheduler?: NodeJS.Timeout };

/** Checks retention and scheduled Get on Board syncs every 5 minutes. */
export function startScheduler(options: { enableGetOnBoard?: boolean } = {}) {
  if (g.__ohScheduler) return;
  const enableGetOnBoard = options.enableGetOnBoard ?? true;
  const tick = async () => {
    try {
      const purged = await purgeExpiredUpworkContent();
      if (purged) console.log(`[scheduler] purged ${purged} expired Upwork opportunities`);
    } catch (e) {
      console.error("[scheduler] Upwork retention purge failed", e instanceof Error ? e.message : e);
    }
    if (enableGetOnBoard) {
      try {
        const rescored = await rescoreStale();
        if (rescored) console.log(`[scheduler] re-scored ${rescored} opportunities with the current scoring version`);
      } catch (e) {
        console.error("[scheduler] rescore failed", e instanceof Error ? e.message : e);
      }
    }
    try {
      if (!enableGetOnBoard) return;
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
  console.log(`[scheduler] started (Upwork retention${enableGetOnBoard ? " + Get on Board" : ""})`);
}

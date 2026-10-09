import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema, sqlClient } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";
import { ingestOpportunity } from "@/server/ingestion/pipeline";
import { logActivity } from "@/server/services/activity";
import { searchJobs, sleep } from "./client";
import { gobJobSchema, mapGobJob } from "./mapper";

const LOCK_ID = 7_310_001; // arbitrary, app-specific advisory lock id
const REQUEST_DELAY_MS = 800;

export interface SyncSummary {
  runId: number | null;
  status: "success" | "partial" | "error" | "skipped";
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
}

/**
 * Syncs public Get on Board jobs for the configured queries.
 * A Postgres advisory lock (on a reserved connection) guarantees a single concurrent run.
 */
export async function syncGetOnBoard(trigger: "manual" | "schedule", fetchImpl?: typeof fetch): Promise<SyncSummary> {
  const settings = await getSettings();
  const cfg = settings.sync.getonboard;
  const source = await db.query.sources.findFirst({ where: eq(schema.sources.key, "getonboard") });
  if (!source || source.status === "disabled" || (trigger === "schedule" && !cfg.enabled)) {
    return { runId: null, status: "skipped", fetched: 0, created: 0, updated: 0, skipped: 0, errors: [], message: "Fuente deshabilitada" };
  }

  const conn = await sqlClient.reserve();
  try {
    const [{ locked }] = await conn<{ locked: boolean }[]>`select pg_try_advisory_lock(${LOCK_ID}) as locked`;
    if (!locked) {
      return { runId: null, status: "skipped", fetched: 0, created: 0, updated: 0, skipped: 0, errors: [], message: "Ya hay una sincronización en curso" };
    }
    try {
      // Close runs left as "running" by a crashed process.
      await db
        .update(schema.syncRuns)
        .set({ status: "error", finishedAt: new Date(), errors: sql`errors || '["Interrumpida (proceso reiniciado)"]'::jsonb` })
        .where(and(eq(schema.syncRuns.sourceKey, "getonboard"), eq(schema.syncRuns.status, "running"), lt(schema.syncRuns.startedAt, new Date(Date.now() - 60 * 60 * 1000))));
      return await runSync(trigger, settings, fetchImpl);
    } finally {
      await conn`select pg_advisory_unlock(${LOCK_ID})`;
    }
  } finally {
    conn.release();
  }
}

async function runSync(trigger: "manual" | "schedule", settings: Awaited<ReturnType<typeof getSettings>>, fetchImpl?: typeof fetch): Promise<SyncSummary> {
  const cfg = settings.sync.getonboard;
  const startedAt = new Date();
  const [run] = await db
    .insert(schema.syncRuns)
    .values({ sourceKey: "getonboard", trigger, params: { queries: cfg.queries, maxPagesPerQuery: cfg.maxPagesPerQuery, remoteOnly: cfg.remoteOnly } })
    .returning();

  const errors: string[] = [];
  const seen = new Set<string>();
  let fetched = 0,
    created = 0,
    updated = 0,
    skipped = 0,
    requests = 0;

  for (const query of cfg.queries) {
    for (let page = 1; page <= cfg.maxPagesPerQuery; page++) {
      if (requests++ > 0) await sleep(REQUEST_DELAY_MS);
      let result;
      try {
        result = await searchJobs(query, page, { fetchImpl });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        break;
      }
      for (const item of result.items) {
        fetched++;
        const parsed = gobJobSchema.safeParse(item);
        if (!parsed.success) {
          skipped++;
          if (errors.length < 20) errors.push(`Item con formato inesperado (${(item as { id?: string })?.id ?? "sin id"}): ${parsed.error.issues[0]?.message}`);
          continue;
        }
        if (seen.has(parsed.data.id)) continue;
        seen.add(parsed.data.id);
        const normalized = mapGobJob(parsed.data);
        if (cfg.remoteOnly && normalized.remote === false) {
          skipped++;
          continue;
        }
        try {
          const r = await ingestOpportunity(normalized, settings, { syncRunId: run.id, actor: "system" });
          if (r.outcome === "created") created++;
          else if (r.outcome === "updated") updated++;
        } catch (e) {
          errors.push(`Error ingiriendo ${parsed.data.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (page >= result.totalPages) break;
    }
  }

  const status: SyncSummary["status"] = errors.length === 0 ? "success" : created + updated > 0 || fetched > 0 ? "partial" : "error";
  const finishedAt = new Date();
  await db
    .update(schema.syncRuns)
    .set({ status, finishedAt, fetched, created, updated, skipped, errors: errors.slice(0, 50) })
    .where(eq(schema.syncRuns.id, run.id));
  await db
    .update(schema.sources)
    .set({
      lastRunAt: startedAt,
      ...(status !== "error" ? { lastSyncAt: finishedAt } : {}),
      lastError: errors.length ? errors[0] : null,
      status: status === "error" ? "error" : "connected",
      importedCount: sql`${schema.sources.importedCount} + ${created}`,
    })
    .where(eq(schema.sources.key, "getonboard"));
  const message = `Get on Board: ${fetched} recibidas, ${created} nuevas, ${updated} actualizadas, ${skipped} omitidas${errors.length ? `, ${errors.length} errores` : ""}.`;
  await logActivity({ entityType: "source", entityId: "getonboard", action: "sync", summary: message, actor: trigger === "manual" ? "user" : "system", metadata: { runId: run.id } });
  return { runId: run.id, status, fetched, created, updated, skipped, errors, message };
}

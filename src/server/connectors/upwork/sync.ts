import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, sqlClient } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";
import { ingestOpportunity } from "@/server/ingestion/pipeline";
import { logActivity } from "@/server/services/activity";
import { mapUpworkMcpJob, upworkMcpJobSchema } from "./mcp-mapper";
import { capUpworkJobResults, parseUpworkAccounts, safeUpworkMcpErrorMessage, UpworkMcpError, withUpworkMcp, type UpworkFindJobsArgs } from "./mcp-client";
import { getUpworkOAuthConfig, UpworkConfigError } from "./config";
import { getUpworkConnection, setUpworkOrgUid } from "./token-store";
import { purgeExpiredUpworkContent, UPWORK_CONTENT_TTL_MS } from "./retention";
import { UPWORK_ADVISORY_LOCK_ID } from "./lock";

const MIN_RUN_INTERVAL_MS = 30_000;
const MAX_RESULTS = 10;

export const upworkSearchSchema = z.object({
  query: z.string().trim().max(160).optional().default(""),
  title: z.string().trim().max(160).optional().default(""),
  mode: z.enum(["search", "smart_search"]).default("search"),
  limit: z.coerce.number().int().min(1).max(MAX_RESULTS).default(10),
  jobType: z.enum(["", "fixed", "hourly"]).default(""),
  experienceLevel: z.string().trim().max(40).default(""),
  skills: z.string().trim().max(500).default(""),
  verifiedPaymentOnly: z.boolean().default(false),
});

export type UpworkSearchInput = z.infer<typeof upworkSearchSchema>;

export interface UpworkSyncSummary {
  runId: number | null;
  status: "success" | "partial" | "error" | "skipped";
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
}

function summary(status: UpworkSyncSummary["status"], message: string): UpworkSyncSummary {
  return { runId: null, status, fetched: 0, created: 0, updated: 0, skipped: 0, errors: [], message };
}

function skillsFromInput(value: string): string[] {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 5);
}

function safeParams(input: UpworkSearchInput) {
  return {
    query: input.query || null,
    title: input.title || null,
    mode: input.mode,
    limit: input.limit,
    jobType: input.jobType || null,
    experienceLevel: input.experienceLevel || null,
    skills: skillsFromInput(input.skills),
    verifiedPaymentOnly: input.verifiedPaymentOnly,
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof UpworkMcpError) return safeUpworkMcpErrorMessage(error);
  if (error instanceof UpworkConfigError) return error.message;
  if (error instanceof Error && /^(Upwork |El refresh token|La conexión Upwork|No se pudo descifrar)/.test(error.message)) return error.message;
  return "No se pudo completar la búsqueda de Upwork";
}

async function resolveOrgUid(fetchImpl?: typeof fetch) {
  const config = getUpworkOAuthConfig();
  const connection = await getUpworkConnection();
  const accounts = parseUpworkAccounts(await withUpworkMcp((client) => client.listAccounts(), fetchImpl));
  const preferred = config.orgUid ?? connection?.orgUid;
  if (preferred) {
    if (accounts.some((account) => account.orgUid === preferred)) {
      if (connection?.orgUid !== preferred) await setUpworkOrgUid(preferred);
      return preferred;
    }
    throw new Error("La cuenta Upwork seleccionada ya no está disponible; revisa UPWORK_MCP_ORG_UID");
  }
  if (accounts.length !== 1) throw new Error(accounts.length === 0 ? "Upwork no devolvió una cuenta seleccionable" : "Upwork devolvió varias cuentas; define UPWORK_MCP_ORG_UID antes de buscar");
  await setUpworkOrgUid(accounts[0].orgUid);
  return accounts[0].orgUid;
}

function findJobsArgs(input: UpworkSearchInput, orgUid: string): UpworkFindJobsArgs {
  const args: UpworkFindJobsArgs = {
    org_uid: orgUid,
    action: input.mode,
    limit: input.limit,
  };
  if (input.query) args.query = input.query;
  if (input.title) args.title = input.title;
  if (input.mode === "search") args.sort = "recency";
  if (input.jobType) args.job_type = input.jobType;
  if (input.experienceLevel) args.experience_level = input.experienceLevel;
  const skills = skillsFromInput(input.skills);
  if (skills.length) args.skills = skills;
  if (input.verifiedPaymentOnly) args.verified_payment_only = true;
  return args;
}

/** Read-only, manual-only Upwork MCP search. No scheduled trigger is supported. */
export async function searchUpworkJobs(input: UpworkSearchInput, fetchImpl?: typeof fetch): Promise<UpworkSyncSummary> {
  const source = await db.query.sources.findFirst({ where: eq(schema.sources.key, "upwork") });
  if (!source || source.status === "disabled") return summary("skipped", "Upwork está deshabilitado");

  await db
    .update(schema.syncRuns)
    .set({ status: "error", finishedAt: new Date(), errors: ["Interrumpida (proceso reiniciado)"] })
    .where(and(eq(schema.syncRuns.sourceKey, "upwork"), eq(schema.syncRuns.status, "running"), lt(schema.syncRuns.startedAt, new Date(Date.now() - 60 * 60 * 1000))));
  const [latest] = await db.select().from(schema.syncRuns).where(eq(schema.syncRuns.sourceKey, "upwork")).orderBy(desc(schema.syncRuns.startedAt)).limit(1);
  if (latest?.status === "running") return summary("skipped", "Ya hay una búsqueda de Upwork en curso");
  if (latest && Date.now() - latest.startedAt.getTime() < MIN_RUN_INTERVAL_MS) return summary("skipped", "Espera unos segundos antes de repetir la búsqueda de Upwork");

  const conn = await sqlClient.reserve();
  try {
    const [{ locked }] = await conn<{ locked: boolean }[]>`select pg_try_advisory_lock(${UPWORK_ADVISORY_LOCK_ID}) as locked`;
    if (!locked) return summary("skipped", "Ya hay una búsqueda de Upwork en curso");
    try {
      await purgeExpiredUpworkContent();
      const [run] = await db.insert(schema.syncRuns).values({ sourceKey: "upwork", trigger: "manual", params: safeParams(input) }).returning();
      try {
        const errors: string[] = [];
        let fetched = 0;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const settings = await getSettings();
        const expiresAt = new Date(Date.now() + UPWORK_CONTENT_TTL_MS);
        const orgUid = await resolveOrgUid(fetchImpl);
        const page = await withUpworkMcp((client) => client.findJobs(findJobsArgs(input, orgUid)), fetchImpl);
        const jobs = capUpworkJobResults(page.jobs, input.limit);
        fetched = jobs.length;
        for (const raw of jobs) {
          const parsed = upworkMcpJobSchema.safeParse(raw);
          if (!parsed.success) {
            skipped++;
            if (errors.length < 20) errors.push("Resultado Upwork omitido por formato inesperado");
            continue;
          }
          try {
            const normalized = mapUpworkMcpJob(parsed.data);
            const result = await ingestOpportunity({ ...normalized, retentionExpiresAt: expiresAt, rawPayload: null }, settings, { syncRunId: run.id, actor: "system" });
            if (result.outcome === "created") created++;
            else if (result.outcome === "updated") updated++;
          } catch {
            skipped++;
            if (errors.length < 20) errors.push("Resultado Upwork omitido por un error de ingestión");
          }
        }
        const status: UpworkSyncSummary["status"] = errors.length === 0 ? "success" : fetched > 0 || created + updated > 0 ? "partial" : "error";
        const finishedAt = new Date();
        await db.update(schema.syncRuns).set({ status, finishedAt, fetched, created, updated, skipped, errors: errors.slice(0, 20) }).where(eq(schema.syncRuns.id, run.id));
        await db
          .update(schema.sources)
          .set({ lastRunAt: run.startedAt, ...(status !== "error" ? { lastSyncAt: finishedAt } : {}), lastError: errors[0] ?? null, status: status === "error" ? "error" : "connected", importedCount: sql`${schema.sources.importedCount} + ${created}` })
          .where(eq(schema.sources.key, "upwork"));
        await logActivity({ entityType: "source", entityId: "upwork", action: "sync", summary: `Upwork MCP: ${fetched} recibidas, ${created} nuevas, ${updated} actualizadas, ${skipped} omitidas${errors.length ? `, ${errors.length} errores` : ""}`, actor: "user", metadata: { runId: run.id, mode: input.mode } });
        return { runId: run.id, status, fetched, created, updated, skipped, errors, message: `Upwork MCP: ${fetched} recibidas, ${created} nuevas, ${updated} actualizadas, ${skipped} omitidas${errors.length ? `, ${errors.length} errores` : ""}.` };
      } catch (error) {
        const message = safeErrorMessage(error);
        const finishedAt = new Date();
        await db.update(schema.syncRuns).set({ status: "error", finishedAt, errors: [message] }).where(eq(schema.syncRuns.id, run.id));
        await db.update(schema.sources).set({ lastRunAt: run.startedAt, lastError: message, status: "error" }).where(eq(schema.sources.key, "upwork"));
        await logActivity({ entityType: "source", entityId: "upwork", action: "sync_error", summary: "Error en búsqueda de Upwork MCP", actor: "user", metadata: { runId: run.id } });
        return { runId: run.id, status: "error" as const, fetched: 0, created: 0, updated: 0, skipped: 0, errors: [message], message: "Upwork MCP: la búsqueda falló." };
      }
    } finally {
      await conn`select pg_advisory_unlock(${UPWORK_ADVISORY_LOCK_ID})`;
    }
  } finally {
    conn.release();
  }
}

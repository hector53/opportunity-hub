"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { getSettings } from "@/server/services/settings";
import { logActivity } from "@/server/services/activity";
import { ingestOpportunity } from "@/server/ingestion/pipeline";
import { manualImportSchema, normalizeManualImport } from "@/server/connectors/manual/import";
import { rescoreOpportunity } from "@/server/scoring/persist";
import { filtersToSearchParams, opportunityFiltersSchema } from "./filters";

export type FormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;

const uuid = z.string().uuid();

export async function importOpportunityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAuthenticated();
  const parsed = manualImportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa los campos marcados.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const settings = await getSettings();
  const result = await ingestOpportunity(normalizeManualImport(parsed.data), settings, { actor: "user" });
  revalidatePath("/", "layout");
  redirect(`/opportunities/${result.id}?imported=${result.outcome}`);
}

const STATUS_ACTIONS = {
  review: "reviewing",
  save: "saved",
  discard: "discarded",
  restore: "new",
  archive: "archived",
} as const;

export async function setOpportunityStatusAction(formData: FormData) {
  await assertAuthenticated();
  const id = uuid.parse(formData.get("id"));
  const op = z.enum(["review", "save", "discard", "restore", "archive"]).parse(formData.get("op"));
  const reason = z.string().max(300).optional().parse(formData.get("reason") || undefined);
  const status = STATUS_ACTIONS[op];
  const [opp] = await db
    .update(schema.opportunities)
    .set({ status, discardReason: op === "discard" ? (reason ?? null) : null })
    .where(eq(schema.opportunities.id, id))
    .returning({ title: schema.opportunities.title, isDemo: schema.opportunities.isDemo });
  if (!opp) throw new Error("Oportunidad no encontrada");

  if (op === "save") {
    // Saving creates (or keeps) a pipeline entry in "saved".
    const [app] = await db
      .insert(schema.applications)
      .values({ opportunityId: id, status: "saved", isDemo: opp.isDemo })
      .onConflictDoNothing()
      .returning({ id: schema.applications.id });
    if (app) await db.insert(schema.applicationEvents).values({ applicationId: app.id, kind: "status_change", toStatus: "saved" });
  }
  await logActivity({ entityType: "opportunity", entityId: id, action: op, summary: `${labelFor(op)}: ${opp.title}${reason ? ` (${reason})` : ""}` });
  revalidatePath("/", "layout");
}

function labelFor(op: string) {
  return ({ review: "En revisión", save: "Guardada", discard: "Descartada", restore: "Restaurada", archive: "Archivada" } as Record<string, string>)[op] ?? op;
}

const editSchema = z.object({
  id: uuid,
  clientType: z.enum(["founder", "startup", "smb", "agency", "recruiter", "enterprise", "unknown"]),
  engagementType: z.enum(["freelance", "fractional", "contract", "part_time", "full_time", "unknown"]),
  budgetMin: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().nonnegative().nullable()),
  budgetMax: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().nonnegative().nullable()),
  budgetCurrency: z.preprocess((v) => (v === "" ? null : v), z.string().trim().toUpperCase().length(3).nullable()),
  budgetPeriod: z.enum(["hour", "month", "year", "fixed", "unknown"]),
  language: z.preprocess((v) => (v === "" ? null : v), z.enum(["es", "en", "pt", "other"]).nullable()),
  remote: z.enum(["yes", "no", "unknown"]),
  hoursPerWeek: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(1).max(80).nullable()),
  tags: z.string().max(300).default(""),
  notes: z.string().max(5000).default(""),
});

/** User edits are authoritative: marked as "manual" provenance and preserved on future syncs where possible. */
export async function updateOpportunityAction(formData: FormData) {
  await assertAuthenticated();
  const d = editSchema.parse(Object.fromEntries(formData));
  const current = await db.query.opportunities.findFirst({ where: eq(schema.opportunities.id, d.id) });
  if (!current) throw new Error("Oportunidad no encontrada");
  const provenance = { ...current.provenance };
  const mark = (key: string, changed: boolean) => {
    if (changed) provenance[key] = { kind: "manual", note: "Editado por el usuario" };
  };
  const remote = d.remote === "unknown" ? null : d.remote === "yes";
  mark("clientType", d.clientType !== current.clientType);
  mark("engagementType", d.engagementType !== current.engagementType);
  mark("budget", d.budgetMin !== current.budgetMin || d.budgetMax !== current.budgetMax || d.budgetPeriod !== current.budgetPeriod || d.budgetCurrency !== current.budgetCurrency);
  mark("language", d.language !== current.language);
  mark("remote", remote !== current.remote);
  mark("hoursPerWeek", d.hoursPerWeek !== current.hoursPerWeek);

  const [updated] = await db
    .update(schema.opportunities)
    .set({
      clientType: d.clientType,
      engagementType: d.engagementType,
      budgetMin: d.budgetMin,
      budgetMax: d.budgetMax,
      budgetCurrency: d.budgetCurrency ?? (d.budgetMin != null || d.budgetMax != null ? "USD" : null),
      budgetPeriod: d.budgetPeriod,
      language: d.language,
      remote,
      hoursPerWeek: d.hoursPerWeek,
      tags: d.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      notes: d.notes || null,
      provenance,
    })
    .where(eq(schema.opportunities.id, d.id))
    .returning();
  if (updated.companyId && provenance.clientType?.kind === "manual") {
    await db.update(schema.companies).set({ clientType: d.clientType, clientTypeInferred: false }).where(eq(schema.companies.id, updated.companyId));
  }
  await rescoreOpportunity(updated, await getSettings());
  await logActivity({ entityType: "opportunity", entityId: d.id, action: "edited", summary: `Editada: ${updated.title}` });
  revalidatePath(`/opportunities/${d.id}`);
}

export async function rescoreAction(formData: FormData) {
  await assertAuthenticated();
  const id = uuid.parse(formData.get("id"));
  const opp = await db.query.opportunities.findFirst({ where: eq(schema.opportunities.id, id) });
  if (!opp) throw new Error("Oportunidad no encontrada");
  await rescoreOpportunity(opp, await getSettings());
  revalidatePath(`/opportunities/${id}`);
}

export async function dismissRiskAction(formData: FormData) {
  await assertAuthenticated();
  const flagId = z.coerce.number().int().parse(formData.get("flagId"));
  const dismissed = formData.get("dismissed") === "true";
  const [flag] = await db.update(schema.riskFlags).set({ dismissed }).where(eq(schema.riskFlags.id, flagId)).returning();
  if (flag?.opportunityId) {
    const opp = await db.query.opportunities.findFirst({ where: eq(schema.opportunities.id, flag.opportunityId) });
    if (opp) await rescoreOpportunity(opp, await getSettings());
    revalidatePath(`/opportunities/${flag.opportunityId}`);
  }
}

export async function deleteOpportunityAction(formData: FormData) {
  await assertAuthenticated();
  const id = uuid.parse(formData.get("id"));
  const [row] = await db.delete(schema.opportunities).where(eq(schema.opportunities.id, id)).returning({ title: schema.opportunities.title });
  if (row) await logActivity({ entityType: "opportunity", entityId: id, action: "deleted", summary: `Eliminada: ${row.title}` });
  revalidatePath("/", "layout");
  redirect("/opportunities");
}

export async function savePresetAction(formData: FormData) {
  await assertAuthenticated();
  const name = z.string().trim().min(1).max(80).parse(formData.get("presetName"));
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$") && k !== "presetName")) as Record<string, string>;
  const filters = opportunityFiltersSchema.parse(raw);
  await db.insert(schema.searchPresets).values({ name, filters });
  revalidatePath("/opportunities");
  redirect(`/opportunities?${filtersToSearchParams(filters).toString()}`);
}

export async function deletePresetAction(formData: FormData) {
  await assertAuthenticated();
  const id = z.coerce.number().int().parse(formData.get("presetId"));
  await db.delete(schema.searchPresets).where(eq(schema.searchPresets.id, id));
  revalidatePath("/opportunities");
}

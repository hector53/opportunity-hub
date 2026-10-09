"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { logActivity } from "@/server/services/activity";
import { APPLICATION_STATUSES, canTransition, STATUS_LABELS, STATUSES_COUNTED_AS_SENT, type ApplicationStatus } from "./state-machine";

const statusSchema = z.enum(APPLICATION_STATUSES);

export async function createApplicationAction(formData: FormData) {
  await assertAuthenticated();
  const opportunityId = z.string().uuid().parse(formData.get("opportunityId"));
  const initial = z.enum(["saved", "draft"]).catch("draft").parse(formData.get("status"));
  const opp = await db.query.opportunities.findFirst({ where: eq(schema.opportunities.id, opportunityId) });
  if (!opp) throw new Error("Oportunidad no encontrada");
  const [app] = await db
    .insert(schema.applications)
    .values({ opportunityId, status: initial, language: opp.language, isDemo: opp.isDemo })
    .onConflictDoNothing()
    .returning();
  if (app) {
    await db.insert(schema.applicationEvents).values({ applicationId: app.id, kind: "status_change", toStatus: initial });
    if (opp.status === "new" || opp.status === "reviewing") await db.update(schema.opportunities).set({ status: "saved" }).where(eq(schema.opportunities.id, opportunityId));
    await logActivity({ entityType: "application", entityId: app.id, action: "created", summary: `Aplicación creada (${STATUS_LABELS[initial]}): ${opp.title}` });
  }
  revalidatePath("/", "layout");
}

/**
 * Records a status change the user made in the real world. Moving to "applied" never submits
 * anything — it registers that the user applied on the original platform.
 */
export async function moveApplicationAction(formData: FormData) {
  await assertAuthenticated();
  const id = z.string().uuid().parse(formData.get("applicationId"));
  const to = statusSchema.parse(formData.get("to"));
  const note = z.string().max(1000).optional().parse(formData.get("note") || undefined);
  const app = await db.query.applications.findFirst({ where: eq(schema.applications.id, id) });
  if (!app) throw new Error("Aplicación no encontrada");
  if (!canTransition(app.status, to)) throw new Error(`Transición no válida: ${STATUS_LABELS[app.status]} → ${STATUS_LABELS[to]}`);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.applications)
      .set({ status: to, appliedAt: to === "applied" && !app.appliedAt ? new Date() : app.appliedAt })
      .where(eq(schema.applications.id, id));
    await tx.insert(schema.applicationEvents).values({ applicationId: id, kind: "status_change", fromStatus: app.status, toStatus: to, note: note ?? null });
    const oppStatus = STATUSES_COUNTED_AS_SENT.includes(to as ApplicationStatus) ? "applied" : to === "archived" || to === "withdrawn" ? "archived" : "saved";
    await tx.update(schema.opportunities).set({ status: oppStatus }).where(eq(schema.opportunities.id, app.opportunityId));
  });
  await logActivity({ entityType: "application", entityId: id, action: "status_change", summary: `Aplicación: ${STATUS_LABELS[app.status]} → ${STATUS_LABELS[to]}`, metadata: { opportunityId: app.opportunityId } });
  revalidatePath("/", "layout");
}

const blank = (v: unknown) => (v === "" || v == null ? null : v);
const updateSchema = z.object({
  applicationId: z.string().uuid(),
  proposedRate: z.preprocess(blank, z.coerce.number().positive().max(1_000_000).nullable()),
  rateCurrency: z.preprocess(blank, z.string().trim().toUpperCase().length(3).nullable()),
  ratePeriod: z.enum(["hour", "month", "year", "fixed", "unknown"]),
  appliedAt: z.preprocess(blank, z.coerce.date().nullable()),
  nextFollowUpAt: z.preprocess(blank, z.coerce.date().nullable()),
  nextStep: z.preprocess(blank, z.string().max(300).nullable()),
  language: z.preprocess(blank, z.enum(["es", "en", "pt", "other"]).nullable()),
  links: z.string().max(3000).default(""),
  notes: z.preprocess(blank, z.string().max(10000).nullable()),
  experimentId: z.preprocess(blank, z.coerce.number().int().nullable()),
  experimentVariant: z.preprocess(blank, z.string().max(80).nullable()),
});

export async function updateApplicationAction(formData: FormData) {
  await assertAuthenticated();
  const d = updateSchema.parse(Object.fromEntries(formData));
  const links = d.links
    .split(/\s+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l))
    .slice(0, 20);
  const [app] = await db
    .update(schema.applications)
    .set({
      proposedRate: d.proposedRate,
      rateCurrency: d.rateCurrency ?? "USD",
      ratePeriod: d.ratePeriod,
      appliedAt: d.appliedAt,
      nextFollowUpAt: d.nextFollowUpAt,
      nextStep: d.nextStep,
      language: d.language,
      links,
      notes: d.notes,
      experimentId: d.experimentId,
      experimentVariant: d.experimentId ? d.experimentVariant : null,
    })
    .where(eq(schema.applications.id, d.applicationId))
    .returning();
  if (!app) throw new Error("Aplicación no encontrada");
  await db.insert(schema.applicationEvents).values({ applicationId: app.id, kind: "field_change", note: "Datos de la aplicación actualizados" });
  revalidatePath("/", "layout");
}

export async function addApplicationCommentAction(formData: FormData) {
  await assertAuthenticated();
  const id = z.string().uuid().parse(formData.get("applicationId"));
  const note = z.string().trim().min(1).max(2000).parse(formData.get("note"));
  await db.insert(schema.applicationEvents).values({ applicationId: id, kind: "comment", note });
  revalidatePath("/", "layout");
}

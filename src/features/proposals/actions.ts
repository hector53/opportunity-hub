"use server";

import { and, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { getSettings } from "@/server/services/settings";
import { logActivity } from "@/server/services/activity";
import { aiAvailability, AiError } from "@/server/ai/openrouter";
import { buildTemplateProposal, generateAiProposal } from "@/server/proposals/generate";

export type ProposalState = { error?: string; info?: string } | undefined;

async function nextVersion(opportunityId: string) {
  const last = await db.query.proposalDrafts.findFirst({
    where: eq(schema.proposalDrafts.opportunityId, opportunityId),
    orderBy: desc(schema.proposalDrafts.version),
    columns: { version: true, id: true },
  });
  return { version: (last?.version ?? 0) + 1, parentId: last?.id ?? null };
}

const genSchema = z.object({
  opportunityId: z.string().uuid(),
  language: z.enum(["es", "en"]),
  style: z.enum(["brief", "standard", "detailed"]),
  mode: z.enum(["ai", "template"]),
  rate: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().positive().max(1000).nullable()),
});

/** Generates a new draft version. Never sends anything anywhere. */
export async function generateProposalAction(_prev: ProposalState, formData: FormData): Promise<ProposalState> {
  await assertAuthenticated();
  const d = genSchema.parse(Object.fromEntries(formData));
  const opp = await db.query.opportunities.findFirst({ where: eq(schema.opportunities.id, d.opportunityId) });
  if (!opp) return { error: "Oportunidad no encontrada" };
  const settings = await getSettings();
  const ctx = { title: opp.title, description: opp.description, companyName: opp.companyName, skills: opp.skills, sourceKey: opp.sourceKey };
  const app = await db.query.applications.findFirst({ where: eq(schema.applications.opportunityId, opp.id), columns: { id: true } });

  let content: string;
  let origin: "ai" | "template";
  let model: string | null = null;
  let info: string | undefined;
  if (d.mode === "ai") {
    const avail = aiAvailability(settings);
    if (!avail.available) return { error: `IA no disponible: ${avail.reason} Usa «Plantilla» o configura la IA.` };
    try {
      const r = await generateAiProposal(ctx, settings, d.language, d.style, d.rate);
      content = r.content;
      model = r.model;
      origin = "ai";
      info = [r.cached ? "Resultado desde caché." : null, ...r.warnings].filter(Boolean).join(" ") || undefined;
    } catch (e) {
      return { error: e instanceof AiError ? e.message : "Error generando con IA." };
    }
  } else {
    content = buildTemplateProposal(ctx, settings, d.language, d.style);
    origin = "template";
    info = "Plantilla sin IA: completa las secciones entre [corchetes] antes de usarla.";
  }
  const { version, parentId } = await nextVersion(opp.id);
  await db.insert(schema.proposalDrafts).values({
    opportunityId: opp.id,
    applicationId: app?.id ?? null,
    version,
    parentId,
    language: d.language,
    style: d.style,
    content,
    origin,
    model,
    proposedRate: d.rate,
    changeNote: origin === "ai" ? `Generada con IA (${model})` : "Plantilla generada",
  });
  await logActivity({ entityType: "opportunity", entityId: opp.id, action: "proposal_generated", summary: `Propuesta v${version} (${origin === "ai" ? "IA" : "plantilla"}): ${opp.title}` });
  revalidatePath(`/opportunities/${opp.id}`);
  return { info };
}

const saveSchema = z.object({
  proposalId: z.string().uuid(),
  content: z.string().trim().min(1).max(20000),
  proposedRate: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().positive().max(100000).nullable()),
  changeNote: z.string().max(200).optional(),
});

/** Edits never overwrite: each save creates a new version linked to its parent. */
export async function saveProposalVersionAction(formData: FormData) {
  await assertAuthenticated();
  const d = saveSchema.parse(Object.fromEntries(formData));
  const parent = await db.query.proposalDrafts.findFirst({ where: eq(schema.proposalDrafts.id, d.proposalId) });
  if (!parent) throw new Error("Propuesta no encontrada");
  if (parent.content === d.content && parent.proposedRate === d.proposedRate) return;
  const { version } = await nextVersion(parent.opportunityId);
  await db.insert(schema.proposalDrafts).values({
    opportunityId: parent.opportunityId,
    applicationId: parent.applicationId,
    version,
    parentId: parent.id,
    language: parent.language,
    style: parent.style,
    content: d.content,
    origin: "manual",
    model: null,
    proposedRate: d.proposedRate,
    changeNote: d.changeNote || `Edición manual de v${parent.version}`,
  });
  revalidatePath(`/opportunities/${parent.opportunityId}`);
}

export async function setProposalStatusAction(formData: FormData) {
  await assertAuthenticated();
  const id = z.string().uuid().parse(formData.get("proposalId"));
  const status = z.enum(["draft", "approved", "sent_manually", "discarded"]).parse(formData.get("status"));
  const current = await db.query.proposalDrafts.findFirst({ where: eq(schema.proposalDrafts.id, id) });
  if (!current) throw new Error("Propuesta no encontrada");
  if (status === "approved" || status === "sent_manually") {
    // Only one approved / sent version per opportunity: demote the previous one.
    await db
      .update(schema.proposalDrafts)
      .set({ status: "draft" })
      .where(and(eq(schema.proposalDrafts.opportunityId, current.opportunityId), eq(schema.proposalDrafts.status, status), ne(schema.proposalDrafts.id, id)));
  }
  const [p] = await db.update(schema.proposalDrafts).set({ status }).where(eq(schema.proposalDrafts.id, id)).returning();
  await logActivity({
    entityType: "proposal",
    entityId: id,
    action: status,
    summary: status === "sent_manually" ? `Propuesta v${p.version} marcada como enviada manualmente por ti` : `Propuesta v${p.version}: ${status}`,
  });
  revalidatePath(`/opportunities/${p.opportunityId}`);
}

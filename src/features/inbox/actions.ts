"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { logActivity } from "@/server/services/activity";
import { classifyMessage } from "@/server/inbox/classify";
import { detectContentRisks } from "@/server/security/risk-rules";
import { sha256 } from "@/lib/hash";

export type InboxState = { error?: string; ok?: string } | undefined;

const blank = (v: unknown) => (v === "" || v == null ? undefined : v);
const messageSchema = z.object({
  sourceKey: z.enum(["upwork", "workana", "getonboard", "email", "manual"]),
  fromName: z.preprocess(blank, z.string().max(200).optional()),
  fromAddress: z.preprocess(blank, z.string().max(200).optional()),
  subject: z.preprocess(blank, z.string().max(300).optional()),
  body: z.string().trim().min(1, "El mensaje está vacío").max(20000),
  originalUrl: z.preprocess(blank, z.string().url().refine((u) => /^https?:\/\//i.test(u), "Sólo http(s)").optional()),
  receivedAt: z.preprocess(blank, z.coerce.date().optional()),
  isPartial: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  opportunityId: z.preprocess(blank, z.string().uuid().optional()),
});

/**
 * Manual import of a notification/message. Content is untrusted: it's classified and scanned
 * for risks, never interpreted as instructions. Attachments are never downloaded.
 */
export async function addMessageAction(_prev: InboxState, formData: FormData): Promise<InboxState> {
  await assertAuthenticated();
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  const contentHash = sha256(`${d.sourceKey}|${d.subject ?? ""}|${d.body}`);
  let applicationId: string | null = null;
  if (d.opportunityId) {
    const app = await db.query.applications.findFirst({ where: eq(schema.applications.opportunityId, d.opportunityId), columns: { id: true } });
    applicationId = app?.id ?? null;
  }
  const [msg] = await db
    .insert(schema.messages)
    .values({
      sourceKey: d.sourceKey,
      channel: d.sourceKey === "email" ? "email" : "manual",
      fromName: d.fromName ?? null,
      fromAddress: d.fromAddress ?? null,
      subject: d.subject ?? null,
      body: d.body,
      originalUrl: d.originalUrl ?? null,
      receivedAt: d.receivedAt ?? new Date(),
      isPartial: d.isPartial,
      classification: classifyMessage(d.subject ?? "", d.body),
      classificationInferred: true,
      opportunityId: d.opportunityId ?? null,
      applicationId,
      contentHash,
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) return { error: "Este mensaje ya estaba importado (duplicado)." };
  const risks = detectContentRisks({
    text: `${d.subject ?? ""}\n${d.body}`,
    urls: [{ field: "enlace original", url: d.originalUrl, expectedSource: d.sourceKey === "email" || d.sourceKey === "manual" ? null : d.sourceKey }],
    scanTextLinks: true,
  });
  if (risks.length) await db.insert(schema.riskFlags).values(risks.map((r) => ({ ...r, messageId: msg.id, detectedBy: "rules" })));
  await logActivity({ entityType: "message", entityId: msg.id, action: "imported", summary: `Mensaje importado (${msg.classification}): ${d.subject ?? d.body.slice(0, 60)}` });
  revalidatePath("/", "layout");
  return { ok: `Mensaje guardado y clasificado como «${msg.classification}» (inferido).${risks.length ? ` ${risks.length} alerta(s) de seguridad.` : ""}` };
}

const updateSchema = z.object({
  messageId: z.string().uuid(),
  op: z.enum(["read", "unread", "classify", "link", "delete"]),
  classification: z.preprocess(blank, z.enum(["invitation", "client_reply", "interview_request", "rejection", "offer", "new_opportunity", "other", "unclassified"]).optional()),
  opportunityId: z.preprocess(blank, z.string().uuid().optional()),
});

export async function updateMessageAction(formData: FormData) {
  await assertAuthenticated();
  const d = updateSchema.parse(Object.fromEntries(formData));
  const m = schema.messages;
  if (d.op === "delete") await db.delete(m).where(eq(m.id, d.messageId));
  else if (d.op === "read" || d.op === "unread") await db.update(m).set({ read: d.op === "read" }).where(eq(m.id, d.messageId));
  else if (d.op === "classify" && d.classification) await db.update(m).set({ classification: d.classification, classificationInferred: false }).where(eq(m.id, d.messageId));
  else if (d.op === "link") {
    const app = d.opportunityId ? await db.query.applications.findFirst({ where: eq(schema.applications.opportunityId, d.opportunityId), columns: { id: true } }) : null;
    await db.update(m).set({ opportunityId: d.opportunityId ?? null, applicationId: app?.id ?? null }).where(eq(m.id, d.messageId));
  }
  revalidatePath("/", "layout");
}

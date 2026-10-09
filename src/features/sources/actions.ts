"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { syncGetOnBoard } from "@/server/connectors/getonboard/sync";
import { logActivity } from "@/server/services/activity";
import { sourceDefinition } from "@/server/connectors/registry";

export type SyncState = { message?: string; error?: string } | undefined;

/** Read-only sync from Get on Board's public API. Does not apply or send anything. */
export async function syncSourceAction(_prev: SyncState, formData: FormData): Promise<SyncState> {
  await assertAuthenticated();
  const key = z.literal("getonboard").safeParse(formData.get("sourceKey"));
  if (!key.success) return { error: "Esta fuente no tiene sincronización automática." };
  try {
    const r = await syncGetOnBoard("manual");
    revalidatePath("/", "layout");
    return r.status === "error" ? { error: `${r.message} ${r.errors[0] ?? ""}` } : { message: r.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error de sincronización" };
  }
}

export async function toggleSourceAction(formData: FormData) {
  await assertAuthenticated();
  const key = z.string().parse(formData.get("sourceKey"));
  const enable = formData.get("enable") === "true";
  const def = sourceDefinition(key);
  if (!def) throw new Error("Fuente desconocida");
  await db
    .update(schema.sources)
    .set({ status: enable ? def.defaultStatus : "disabled" })
    .where(eq(schema.sources.key, key));
  await logActivity({ entityType: "source", entityId: key, action: enable ? "enabled" : "disabled", summary: `${def.name} ${enable ? "habilitada" : "deshabilitada"}` });
  revalidatePath("/sources");
}

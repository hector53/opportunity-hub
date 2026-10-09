"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { logActivity } from "@/server/services/activity";

export async function createExperimentAction(formData: FormData) {
  await assertAuthenticated();
  const name = z.string().trim().min(2).max(120).parse(formData.get("name"));
  const hypothesis = z.string().trim().max(1000).optional().parse(formData.get("hypothesis") || undefined);
  const variants = z
    .array(z.string().trim().min(1).max(60))
    .min(2, "Al menos 2 variantes")
    .max(6)
    .parse(
      String(formData.get("variants") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  const [e] = await db.insert(schema.experiments).values({ name, hypothesis: hypothesis ?? null, variants }).returning();
  await logActivity({ entityType: "experiment", entityId: String(e.id), action: "created", summary: `Experimento creado: ${name}` });
  revalidatePath("/experiments");
}

export async function toggleExperimentAction(formData: FormData) {
  await assertAuthenticated();
  const id = z.coerce.number().int().parse(formData.get("id"));
  const active = formData.get("active") === "true";
  await db
    .update(schema.experiments)
    .set({ active, endedAt: active ? null : new Date() })
    .where(eq(schema.experiments.id, id));
  revalidatePath("/experiments");
}

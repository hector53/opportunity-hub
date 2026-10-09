import { db, schema, type Tx } from "@/server/db/client";

export async function logActivity(
  entry: {
    entityType: string;
    entityId?: string | null;
    action: string;
    summary: string;
    actor?: "user" | "system";
    metadata?: Record<string, unknown>;
  },
  tx?: Tx,
) {
  await (tx ?? db).insert(schema.activityLog).values({
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    action: entry.action,
    summary: entry.summary,
    actor: entry.actor ?? "user",
    metadata: entry.metadata ?? {},
  });
}

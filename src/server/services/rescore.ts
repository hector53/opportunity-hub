import { isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { rescoreOpportunity } from "@/server/scoring/persist";
import { getSettings } from "./settings";

/** Re-scores rows that predate the current scoring fields (e.g. right after a migration). Bounded batch. */
export async function rescoreStale(limit = 500): Promise<number> {
  const rows = await db.select().from(schema.opportunities).where(isNull(schema.opportunities.scoreConfidence)).limit(limit);
  if (!rows.length) return 0;
  const settings = await getSettings();
  for (const r of rows) await rescoreOpportunity(r, settings);
  return rows.length;
}

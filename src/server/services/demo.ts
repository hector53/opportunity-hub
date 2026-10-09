import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

/** Removes every record flagged as Demo. Real data is never touched. */
export async function clearDemoData(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.delete(schema.messages).where(eq(schema.messages.isDemo, true));
    await tx.delete(schema.applications).where(eq(schema.applications.isDemo, true));
    const removed = await tx.delete(schema.opportunities).where(eq(schema.opportunities.isDemo, true)).returning({ id: schema.opportunities.id });
    await tx.delete(schema.companies).where(eq(schema.companies.isDemo, true));
    return removed.length;
  });
}

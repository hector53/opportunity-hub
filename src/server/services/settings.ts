import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { appSettingsSchema, DEFAULT_SETTINGS, type AppSettings } from "@/features/settings/types";

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return (override ?? base) as T;
  if (typeof override !== "object" || override === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Loads settings, filling any missing keys from defaults (safe across schema evolution). */
export async function getSettings(): Promise<AppSettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.id, 1) });
  if (!row) return DEFAULT_SETTINGS;
  const merged = deepMerge(DEFAULT_SETTINGS, row.data);
  const parsed = appSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const data = appSettingsSchema.parse(next);
  await db
    .insert(schema.settings)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: schema.settings.id, set: { data, updatedAt: new Date() } });
}

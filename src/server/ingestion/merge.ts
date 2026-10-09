import type { FieldProvenance } from "@/server/normalization/types";

/** Provenance key → columns it covers. Fields the user edited manually survive re-syncs. */
const MANUAL_FIELD_COLUMNS: Record<string, string[]> = {
  clientType: ["clientType"],
  engagementType: ["engagementType"],
  budget: ["budgetMin", "budgetMax", "budgetCurrency", "budgetPeriod"],
  language: ["language"],
  remote: ["remote"],
  hoursPerWeek: ["hoursPerWeek"],
};

export function preserveManualEdits<T extends Record<string, unknown> & { provenance: FieldProvenance }>(
  existing: { provenance: FieldProvenance | null } & Record<string, unknown>,
  incoming: T,
): T {
  const out: Record<string, unknown> = { ...incoming };
  const provenance: FieldProvenance = { ...incoming.provenance };
  for (const [key, entry] of Object.entries(existing.provenance ?? {})) {
    if (entry.kind !== "manual") continue;
    provenance[key] = entry;
    for (const col of MANUAL_FIELD_COLUMNS[key] ?? []) out[col] = existing[col];
  }
  out.provenance = provenance;
  return out as T;
}

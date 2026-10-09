import { gte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/server/services/settings";
import { SettingsForms } from "@/features/settings/forms";

export const metadata = { title: "Settings · Opportunity Hub" };

export default async function SettingsPage() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [s, [{ n }]] = await Promise.all([
    getSettings(),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.aiCalls).where(gte(schema.aiCalls.createdAt, since)),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Perfil, criterios y pesos son configuración editable, no reglas fijas del código." />
      <SettingsForms s={s} aiKeyPresent={Boolean(process.env.OPENROUTER_API_KEY)} aiCallsToday={n} />
    </>
  );
}

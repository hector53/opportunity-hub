/**
 * Seed: ensures sources + default settings. With --demo, adds clearly-labelled synthetic data.
 *   npm run db:seed              → sources + settings only
 *   npm run db:seed -- --demo    → plus Demo records (is_demo = true)
 *   npm run db:seed -- --clear-demo → removes all Demo records
 */
import { eq } from "drizzle-orm";
import { db, schema, sqlClient } from "./client";
import { ensureSources } from "@/server/connectors/registry";
import { DEFAULT_SETTINGS } from "@/features/settings/types";
import { getSettings } from "@/server/services/settings";
import { ingestOpportunity } from "@/server/ingestion/pipeline";
import { normalizeManualImport, type ManualImportInput } from "@/server/connectors/manual/import";
import { sha256 } from "@/lib/hash";
import { clearDemoData } from "@/server/services/demo";
import { existsSync, readFileSync } from "node:fs";
import { appSettingsSchema, type AppSettings } from "@/features/settings/types";

const DEMO: ManualImportInput[] = [
  {
    sourceKey: "upwork",
    title: "[Demo] Senior Full-Stack Engineer for B2B SaaS (fractional, 20h/week)",
    description:
      "We're a 6-person startup building a B2B SaaS for logistics teams. I'm the founder and I need a senior engineer to own features end to end: Next.js frontend, Node/NestJS API, PostgreSQL. Ongoing work with a clear roadmap for the next 6 months. 20 hours per week, US Eastern overlap of 3-4 hours. Experience with Stripe billing and real-time updates (WebSockets) is a plus.",
    companyName: "Demo Logistics SaaS",
    clientType: "founder",
    engagementType: "fractional",
    budgetMin: 40,
    budgetMax: 50,
    budgetCurrency: "USD",
    budgetPeriod: "hour",
    language: "en",
    remote: "yes",
    hoursPerWeek: 20,
    durationText: "6+ months",
    competitorCount: 12,
    url: "https://www.upwork.com/jobs/demo-placeholder-1",
    country: "US",
    tags: "demo",
  },
  {
    sourceKey: "workana",
    title: "[Demo] Desarrollo de chatbot con IA para WhatsApp y reservas",
    description:
      "Somos una agencia de marketing con clientes en salud y restaurantes. Buscamos un desarrollador para construir un asistente con IA (LLM) que responda por WhatsApp, consulte un catálogo y gestione reservas. Proyecto inicial de 6 semanas con posibilidad de mantenimiento mensual. Stack sugerido: Node.js, PostgreSQL. Presupuesto USD 1500 - 2500 fijo.",
    companyName: "Demo Agencia Digital",
    clientType: "agency",
    engagementType: "freelance",
    budgetMin: 1500,
    budgetMax: 2500,
    budgetCurrency: "USD",
    budgetPeriod: "fixed",
    language: "es",
    remote: "yes",
    competitorCount: 34,
    url: "https://www.workana.com/job/demo-placeholder-2",
    country: "Argentina",
    tags: "demo",
  },
  {
    sourceKey: "upwork",
    title: "[Demo] Fix bugs in our Next.js app — quick test task first",
    description:
      "Before hiring, please complete a test: git clone https://github.com/demo-org/demo-test-repo and run npm install && npm run dev, then fix the bug in the dashboard and send us a video. The test should take 6 hours. Payment after we review. Contact me on Telegram to discuss faster. Urgent!",
    companyName: "Demo Unknown Client",
    budgetMin: 15,
    budgetMax: 20,
    budgetCurrency: "USD",
    budgetPeriod: "hour",
    language: "en",
    remote: "yes",
    url: "https://www.upwork.com/jobs/demo-placeholder-3",
    tags: "demo",
  },
  {
    sourceKey: "manual",
    title: "[Demo] Java Spring Boot Developer — onsite Bogotá",
    description:
      "Empresa financiera busca desarrollador Java Spring Boot con 10+ años de experiencia, presencial en Bogotá, tiempo completo. Salario a convenir.",
    companyName: "Demo Banco Corp",
    clientType: "enterprise",
    engagementType: "full_time",
    language: "es",
    remote: "no",
    country: "Colombia",
    tags: "demo",
  },
  {
    sourceKey: "workana",
    title: "[Demo] Dashboard fintech con datos de mercado en tiempo real",
    description:
      "Startup fintech necesita un dashboard configurable para operadores con datos de mercado en tiempo real vía WebSockets. Backend en Python (FastAPI) y frontend React. Contrato de 3 meses, 25 horas por semana, con continuidad si sale bien. USD 35/hora.",
    companyName: "Demo Fintech Startup",
    clientType: "startup",
    language: "es",
    remote: "yes",
    tags: "demo",
  },
];

async function seedDemo() {
  const settings = await getSettings();
  const ids: string[] = [];
  for (const input of DEMO) {
    const r = await ingestOpportunity(normalizeManualImport(input, { isDemo: true }), settings, { actor: "system" });
    ids.push(r.id);
  }
  // Demo applications at different pipeline stages
  const stages = [
    { idx: 0, status: "interview" as const, rate: 45, daysAgo: 6, next: "Preparar llamada técnica", follow: 1 },
    { idx: 1, status: "applied" as const, rate: 2000, daysAgo: 4, next: "Seguimiento si no hay respuesta", follow: -1 },
    { idx: 4, status: "draft" as const, rate: 38, daysAgo: 0, next: "Revisar propuesta", follow: 2 },
  ];
  for (const s of stages) {
    const appliedAt = s.status === "draft" ? null : new Date(Date.now() - s.daysAgo * 86400000);
    const [app] = await db
      .insert(schema.applications)
      .values({
        opportunityId: ids[s.idx],
        status: s.status,
        proposedRate: s.rate,
        ratePeriod: s.idx === 1 ? "fixed" : "hour",
        appliedAt,
        nextFollowUpAt: new Date(Date.now() + s.follow * 86400000),
        nextStep: s.next,
        isDemo: true,
      })
      .onConflictDoNothing()
      .returning();
    if (!app) continue;
    await db.insert(schema.applicationEvents).values({ applicationId: app.id, kind: "status_change", fromStatus: null, toStatus: s.status, note: "Demo" });
    await db.update(schema.opportunities).set({ status: s.status === "draft" ? "saved" : "applied" }).where(eq(schema.opportunities.id, ids[s.idx]));
  }
  const body =
    "Hi, thanks for your proposal. Could we schedule a 30-minute call this week to talk about the roadmap? [Demo — notificación de ejemplo; la conversación completa está en la plataforma]";
  await db
    .insert(schema.messages)
    .values({
      sourceKey: "upwork",
      channel: "email",
      fromName: "Demo Founder",
      subject: "[Demo] New message about Senior Full-Stack Engineer",
      body,
      originalUrl: "https://www.upwork.com/ab/messages/rooms/demo-placeholder",
      isPartial: true,
      classification: "interview_request",
      opportunityId: ids[0],
      contentHash: sha256(`demo:${body}`),
      isDemo: true,
    })
    .onConflictDoNothing();
  console.log(`[seed] demo data: ${ids.length} opportunities`);
}

/** Defaults, overridden by a private, git-ignored profile file when present. Only used for the first seed. */
function initialSettings(): AppSettings {
  const file = process.env.PROFILE_FILE ?? "config/profile.local.json";
  if (!existsSync(file)) return DEFAULT_SETTINGS;
  const local = JSON.parse(readFileSync(file, "utf8")) as Partial<AppSettings>;
  const merged = appSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...local });
  console.log(`[seed] using profile from ${file}`);
  return merged;
}

async function main() {
  const args = process.argv.slice(2);
  await ensureSources();
  await db.insert(schema.settings).values({ id: 1, data: initialSettings() }).onConflictDoNothing();
  console.log("[seed] sources + settings ensured");
  if (args.includes("--clear-demo")) {
    const n = await clearDemoData();
    console.log(`[seed] removed demo data (${n} opportunities)`);
  } else if (args.includes("--demo")) {
    await seedDemo();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());

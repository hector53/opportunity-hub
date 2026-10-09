"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { assertAuthenticated } from "@/server/auth/guard";
import { getSettings, saveSettings } from "@/server/services/settings";
import { rescoreOpportunity } from "@/server/scoring/persist";
import { logActivity } from "@/server/services/activity";
import { clearDemoData } from "@/server/services/demo";
import { appSettingsSchema, type AppSettings } from "./types";

export type SettingsState = { ok?: string; error?: string } | undefined;

const csv = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
const num = (v: FormDataEntryValue | null) => Number(v);

function parseSkills(text: string): AppSettings["profile"]["skills"] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [name, level, aliases] = line.split("|").map((s) => s?.trim());
      const lvl = z.enum(["core", "secondary", "complementary"]).safeParse(level);
      if (!name || !lvl.success) throw new Error(`Skill línea ${i + 1}: formato «Nombre | core|secondary|complementary | alias, alias»`);
      return { name, level: lvl.data, aliases: csv(aliases ?? "") };
    });
}

function parseExperiences(text: string): AppSettings["profile"]["experiences"] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [key, name, summary, tags] = line.split("|").map((s) => s?.trim());
      if (!key || !name || !summary) throw new Error(`Experiencia línea ${i + 1}: formato «clave | Nombre | Resumen verificable | tags, tags»`);
      return { key, name, summary, tags: csv(tags ?? "").map((t) => t.toLowerCase()) };
    });
}

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await assertAuthenticated();
  const section = String(formData.get("section"));
  const current = await getSettings();
  const next: AppSettings = structuredClone(current);
  try {
    switch (section) {
      case "profile":
        next.profile.name = String(formData.get("name") ?? "").trim();
        next.profile.headline = String(formData.get("headline") ?? "").trim();
        next.profile.yearsExperience = num(formData.get("yearsExperience"));
        next.profile.location = String(formData.get("location") ?? "").trim();
        next.profile.languages = [
          { code: "es", level: z.enum(["native", "fluent", "conversational", "basic"]).parse(formData.get("lang_es")) },
          { code: "en", level: z.enum(["native", "fluent", "conversational", "basic"]).parse(formData.get("lang_en")) },
        ];
        next.profile.skills = parseSkills(String(formData.get("skills") ?? ""));
        next.profile.experiences = parseExperiences(String(formData.get("experiences") ?? ""));
        break;
      case "preferences":
        next.preferences = {
          minHourlyRate: num(formData.get("minHourlyRate")),
          targetHourlyRate: num(formData.get("targetHourlyRate")),
          currency: String(formData.get("currency") ?? "USD").toUpperCase(),
          preferredClientTypes: formData.getAll("preferredClientTypes").map(String),
          preferredSectors: csv(formData.get("preferredSectors")).map((s) => s.toLowerCase()),
          preferredEngagements: csv(formData.get("preferredEngagements")),
          preferredRegions: csv(formData.get("preferredRegions")),
          spanishShare: num(formData.get("spanishShare")),
          weeklyApplicationTarget: num(formData.get("weeklyApplicationTarget")),
          hoursPerWeekAvailable: num(formData.get("hoursPerWeekAvailable")),
        };
        break;
      case "scoring":
        next.scoring = {
          weights: {
            tech: num(formData.get("w_tech")),
            client: num(formData.get("w_client")),
            commercial: num(formData.get("w_commercial")),
            practical: num(formData.get("w_practical")),
          },
          unfamiliarTech: csv(formData.get("unfamiliarTech")).map((s) => s.toLowerCase()),
        };
        break;
      case "ai":
        next.ai = {
          enabled: formData.get("enabled") === "on",
          model: String(formData.get("model") ?? "").trim(),
          timeoutMs: num(formData.get("timeoutMs")),
          maxDailyCalls: num(formData.get("maxDailyCalls")),
        };
        break;
      case "sync":
        next.sync.getonboard = {
          enabled: formData.get("enabled") === "on",
          intervalMinutes: num(formData.get("intervalMinutes")),
          queries: csv(formData.get("queries")),
          maxPagesPerQuery: num(formData.get("maxPagesPerQuery")),
          remoteOnly: formData.get("remoteOnly") === "on",
        };
        break;
      default:
        return { error: "Sección desconocida" };
    }
    const parsed = appSettingsSchema.safeParse(next);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { error: `${issue.path.join(".")}: ${issue.message}` };
    }
    await saveSettings(parsed.data);
    await logActivity({ entityType: "settings", action: "updated", summary: `Settings actualizados (${section})` });
    revalidatePath("/", "layout");
    return { ok: section === "profile" || section === "preferences" || section === "scoring" ? "Guardado. Usa «Recalcular todos» para aplicar a oportunidades existentes." : "Guardado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error guardando" };
  }
}

export async function rescoreAllAction(): Promise<SettingsState> {
  await assertAuthenticated();
  const settings = await getSettings();
  const all = await db.query.opportunities.findMany();
  for (const o of all) await rescoreOpportunity(o, settings);
  await logActivity({ entityType: "settings", action: "rescore_all", summary: `Recalculados ${all.length} scores` });
  revalidatePath("/", "layout");
  return { ok: `Recalculadas ${all.length} oportunidades.` };
}

export async function clearDemoAction(): Promise<SettingsState> {
  await assertAuthenticated();
  const n = await clearDemoData();
  await logActivity({ entityType: "settings", action: "clear_demo", summary: `Eliminados ${n} registros Demo` });
  revalidatePath("/", "layout");
  return { ok: `Eliminadas ${n} oportunidades Demo (y sus aplicaciones/mensajes Demo).` };
}

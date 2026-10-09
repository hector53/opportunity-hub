import type { AppSettings } from "@/features/settings/types";
import { containsTerm, snippetAround, toHourly } from "@/server/normalization/text";
import type { BudgetPeriod, ClientType, EngagementType } from "@/server/normalization/types";
import type { DimensionResult, ScoreReason, ScoreResult } from "./types";

export const SCORING_VERSION = "det-1.0";

export interface ScoringInput {
  title: string;
  description: string;
  skills: string[];
  clientType: ClientType;
  sector: string | null;
  engagementType: EngagementType;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  budgetPeriod: BudgetPeriod;
  hoursPerWeek: number | null;
  durationText: string | null;
  seniority: string | null;
  language: string | null;
  remote: boolean | null;
  remoteModality: string | null;
  countries: string[];
  competitorCount: number | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

class Dim {
  reasons: ScoreReason[] = [];
  unknowns: string[] = [];
  constructor(public base: number) {}
  add(impact: number, text: string, evidence?: string) {
    this.reasons.push({ impact, text, evidence });
  }
  unknown(what: string) {
    this.unknowns.push(what);
  }
  result(known: boolean): DimensionResult {
    if (!known) return { score: null, reasons: this.reasons, unknowns: this.unknowns };
    const total = this.reasons.reduce((s, r) => s + r.impact, this.base);
    return { score: clamp(total), reasons: this.reasons, unknowns: this.unknowns };
  }
}

function findEvidence(text: string, term: string): string | undefined {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  return idx >= 0 ? snippetAround(text, idx, 50) : undefined;
}

const RECURRENCE_RE =
  /\b(long[- ]term|ongoing|on-?going|recurring|retainer|largo plazo|continuidad|mantenimiento|maintenance|roadmap|multiple phases|varias fases|future work|trabajo futuro|extend(ed)? engagement)\b/i;

// ---------- Technology / Job fit ----------

export function scoreTech(input: ScoringInput, settings: AppSettings): DimensionResult {
  const d = new Dim(35);
  const text = `${input.title}\n${input.description}`;
  const skillsText = input.skills.join(" , ").toLowerCase();
  const haystack = `${text}\n${skillsText}`.toLowerCase();
  const titleLower = input.title.toLowerCase();

  if (haystack.trim().length < 60 && input.skills.length === 0) {
    d.unknown("Descripción técnica insuficiente para evaluar encaje");
    return d.result(false);
  }

  let coreGain = 0;
  let secondaryGain = 0;
  const matched: string[] = [];
  for (const skill of settings.profile.skills) {
    const terms = [skill.name, ...skill.aliases].map((t) => t.toLowerCase());
    const hit = terms.find((t) => containsTerm(haystack, t));
    if (!hit) continue;
    matched.push(skill.name);
    if (skill.level === "core") coreGain += containsTerm(titleLower, hit) ? 14 : 10;
    else if (skill.level === "secondary") secondaryGain += 5;
    else secondaryGain += 1;
  }
  if (coreGain > 0) d.add(Math.min(coreGain, 45), `Coincide con skills principales`, matched.join(", "));
  if (secondaryGain > 0) d.add(Math.min(secondaryGain, 12), "Coincide con skills secundarias/complementarias");
  if (matched.length === 0) d.add(-15, "No se detectan tecnologías del perfil en el texto");

  // Unfamiliar primary technologies
  for (const tech of settings.scoring.unfamiliarTech) {
    if (containsTerm(titleLower, tech) || input.skills.some((s) => s.toLowerCase() === tech)) {
      d.add(-18, `Tecnología principal que no forma parte del perfil: ${tech}`, findEvidence(text, tech) ?? tech);
    } else if (containsTerm(haystack, tech)) {
      d.add(-5, `Menciona tecnología fuera del perfil: ${tech}`, findEvidence(text, tech));
    }
  }

  // Relevant past experiences (by tag overlap)
  const relevant = settings.profile.experiences.filter((e) => e.tags.some((t) => containsTerm(haystack, t)));
  if (relevant.length) d.add(Math.min(relevant.length * 4, 10), "Experiencias previas relevantes", relevant.map((e) => e.name).join(", "));

  // Years of experience demanded beyond profile
  const years = text.match(/(\d{1,2})\+?\s*(?:years|años|anos)/i);
  if (years && Number(years[1]) > settings.profile.yearsExperience + 1) {
    d.add(-12, `Pide ${years[1]} años de experiencia (perfil: ${settings.profile.yearsExperience})`, years[0]);
  }
  return d.result(true);
}

// ---------- Client fit ----------

const CLIENT_BASE: Record<ClientType, number | null> = {
  founder: 80,
  startup: 75,
  smb: 68,
  agency: 62,
  enterprise: 48,
  recruiter: 35,
  unknown: null,
};

export function scoreClient(input: ScoringInput, settings: AppSettings): DimensionResult {
  const base = CLIENT_BASE[input.clientType];
  const d = new Dim(base ?? 50);
  let signals = base !== null;
  const text = `${input.title}\n${input.description}`;

  if (base === null) d.unknown("Tipo de cliente (founder/agencia/recruiter) no identificado");
  else d.reasons.push({ impact: 0, text: `Tipo de cliente: ${input.clientType} (base ${base})` });

  if (base !== null && settings.preferences.preferredClientTypes.includes(input.clientType)) {
    d.add(5, "Tipo de cliente preferido");
  }
  if (input.clientType === "recruiter") d.add(-5, "Intermediario: relación indirecta con el cliente final");

  if (input.sector) {
    signals = true;
    if (settings.preferences.preferredSectors.includes(input.sector)) d.add(8, `Sector de interés: ${input.sector}`);
  } else d.unknown("Sector");

  const rec = text.match(RECURRENCE_RE);
  if (rec) {
    signals = true;
    d.add(8, "Señales de continuidad / relación recurrente", rec[0]);
  }

  if (input.competitorCount != null) {
    signals = true;
    if (input.competitorCount <= 10) d.add(5, `Pocos competidores (${input.competitorCount})`);
    else if (input.competitorCount >= 50) d.add(-8, `Muchos competidores (${input.competitorCount})`);
  } else d.unknown("Número de competidores");

  return d.result(signals);
}

// ---------- Commercial fit ----------

export function scoreCommercial(input: ScoringInput, settings: AppSettings): DimensionResult {
  const d = new Dim(50);
  let signals = false;
  const { minHourlyRate, targetHourlyRate } = settings.preferences;
  const text = `${input.title}\n${input.description}`;

  const amount = input.budgetMax ?? input.budgetMin;
  const nonUsd = input.budgetCurrency && input.budgetCurrency !== settings.preferences.currency;
  const hourly = nonUsd ? null : toHourly(amount, input.budgetPeriod);
  if (hourly != null) {
    signals = true;
    const ev = `${input.budgetMin ?? "?"}–${input.budgetMax ?? "?"} ${input.budgetCurrency ?? ""}/${input.budgetPeriod} ≈ ${hourly}/h`;
    if (hourly >= targetHourlyRate) d.add(28, `Tarifa ≥ objetivo (${targetHourlyRate}/h)`, ev);
    else if (hourly >= minHourlyRate) d.add(14, `Tarifa dentro del rango aceptable (≥ ${minHourlyRate}/h)`, ev);
    else if (hourly >= minHourlyRate * 0.7) d.add(-15, `Tarifa por debajo del mínimo (${minHourlyRate}/h)`, ev);
    else d.add(-32, "Tarifa muy por debajo del mínimo", ev);
  } else if (input.budgetPeriod === "fixed" && amount != null) {
    signals = true;
    if (amount < 300) d.add(-20, "Presupuesto fijo muy bajo; riesgo de alcance desproporcionado", `${amount} ${input.budgetCurrency ?? ""}`);
    else if (amount < 1000) d.add(-6, "Presupuesto fijo bajo: verificar alcance", `${amount} ${input.budgetCurrency ?? ""}`);
    else d.add(6, "Presupuesto fijo razonable", `${amount} ${input.budgetCurrency ?? ""}`);
  } else {
    if (nonUsd && amount != null) d.unknown(`Presupuesto en ${input.budgetCurrency}: sin conversión automática`);
    else d.unknown("Presupuesto / tarifa");
  }

  if (input.engagementType !== "unknown") {
    signals = true;
    const idx = settings.preferences.preferredEngagements.indexOf(input.engagementType);
    if (idx >= 0) d.add([14, 9, 6][idx] ?? 4, `Modalidad preferida: ${input.engagementType}`);
    else if (input.engagementType === "full_time") d.add(0, "Full-time: alternativa, no prioridad");
  } else d.unknown("Modalidad (freelance/fractional/full-time)");

  if (input.hoursPerWeek != null) {
    signals = true;
    if (input.hoursPerWeek >= 10 && input.hoursPerWeek <= 30) d.add(8, `Dedicación ${input.hoursPerWeek}h/semana compatible con fractional`);
  }

  const rec = text.match(RECURRENCE_RE);
  if (rec) d.add(6, "Potencial de ingresos recurrentes", rec[0]);

  if (input.description.trim().length < 400) d.add(-10, "Descripción breve: alcance poco claro");

  if (input.seniority && /junior|sin experiencia|intern|práctica|trainee/i.test(input.seniority)) {
    d.add(-15, `Seniority ${input.seniority}: tarifa probablemente baja`, input.seniority);
  }
  return d.result(signals);
}

// ---------- Practical fit ----------

const GEO_RESTRICTION_RE =
  /\b(us[- ]only|usa only|must (be )?(located|based|reside) in (the )?(us|usa|united states|europe|eu|uk|canada)|authorized to work in the (us|united states)|(u\.s\.|us) citizens? only|security clearance|solo residentes en|residir en (chile|m[eé]xico|colombia|per[uú]|argentina|espa[ñn]a)|presencial)\b/i;
const LATAM_OK_RE = /\b(latam|latin america|latinoam[eé]rica|anywhere|worldwide|cualquier pa[ií]s)\b/i;

/** Location words from the profile (e.g. "Uruguay (remote)" → ["uruguay"]). Nothing is hardcoded. */
function homeTerms(settings: AppSettings): string[] {
  return settings.profile.location
    .toLowerCase()
    .split(/[^a-záéíóúñ]+/)
    .filter((w) => w.length > 3 && w !== "remote" && w !== "remoto");
}

export function scorePractical(input: ScoringInput, settings: AppSettings): DimensionResult {
  const d = new Dim(55);
  let signals = false;
  const text = `${input.title}\n${input.description}`;
  const langs = settings.profile.languages;

  if (input.language) {
    signals = true;
    const l = langs.find((x) => x.code === input.language);
    if (!l) d.add(-25, `Idioma de la oportunidad (${input.language}) fuera del perfil`);
    else if (l.level === "native" || l.level === "fluent") d.add(10, `Idioma ${input.language}: ${l.level}`);
    else d.add(0, `Idioma ${input.language}: nivel ${l.level}`);
  } else d.unknown("Idioma");

  const fluent = text.match(/\b(native|fluent|c2|bilingual)\s+english|english\s+(native|fluent|c2)|ingl[eé]s\s+(nativo|fluido|avanzado|c1|c2)/i);
  const enLevel = langs.find((x) => x.code === "en")?.level;
  if (fluent && enLevel !== "native" && enLevel !== "fluent") d.add(-12, "Requiere inglés avanzado/nativo", fluent[0]);

  if (input.remote === true) {
    signals = true;
    d.add(18, "Remoto");
  } else if (input.remote === false) {
    signals = true;
    d.add(-40, "Presencial / no remoto", input.remoteModality ?? undefined);
  } else d.unknown("Remoto / presencial");

  if (input.remoteModality === "hybrid") d.add(-30, "Modalidad híbrida", "hybrid");
  if (input.remoteModality === "remote_local") {
    d.add(-4, "Remoto con restricción geográfica (remote_local): verificar países admitidos", "remote_local");
    d.unknown("Países admitidos para remote_local");
  }

  const geo = text.match(GEO_RESTRICTION_RE);
  if (geo) {
    signals = true;
    d.add(-30, "Posible restricción geográfica incompatible", snippetAround(text, geo.index ?? 0, 50));
  }
  const ok = text.match(LATAM_OK_RE) ?? homeTerms(settings).map((h) => text.toLowerCase().match(new RegExp(`\\b${h}\\b`))).find(Boolean) ?? null;
  if (ok) {
    signals = true;
    d.add(8, "Acepta LATAM / cualquier ubicación", ok[0]);
  }
  if (input.countries.length) {
    signals = true;
    const home = homeTerms(settings);
    if (input.countries.some((c) => /remote|latam/i.test(c) || home.some((h) => c.toLowerCase().includes(h)))) {
      d.add(4, "Países listados compatibles", input.countries.join(", "));
    }
  }

  if (input.hoursPerWeek != null && input.hoursPerWeek > settings.preferences.hoursPerWeekAvailable) {
    d.add(-8, `Pide ${input.hoursPerWeek}h/semana (disponible: ${settings.preferences.hoursPerWeekAvailable}h)`);
  }
  if (input.engagementType === "full_time" && settings.preferences.hoursPerWeekAvailable < 40) {
    d.add(-6, "Full-time excede la disponibilidad semanal configurada");
  }
  return d.result(signals);
}

// ---------- Aggregate ----------

export function scoreOpportunity(input: ScoringInput, settings: AppSettings): ScoreResult {
  const tech = scoreTech(input, settings);
  const client = scoreClient(input, settings);
  const commercial = scoreCommercial(input, settings);
  const practical = scorePractical(input, settings);
  const w = settings.scoring.weights;
  const parts: [number | null, number][] = [
    [tech.score, w.tech],
    [client.score, w.client],
    [commercial.score, w.commercial],
    [practical.score, w.practical],
  ];
  const known = parts.filter(([s, wt]) => s !== null && wt > 0) as [number, number][];
  const unknownCount = parts.filter(([s]) => s === null).length;
  const weightSum = known.reduce((s, [, wt]) => s + wt, 0);
  const overall = weightSum > 0 ? clamp(known.reduce((s, [v, wt]) => s + v * wt, 0) / weightSum) : null;
  const overallNote =
    overall === null
      ? "Sin información suficiente para calcular un score global."
      : unknownCount >= 2
        ? `Baja confianza: ${unknownCount} dimensiones sin datos (Unknown) no se incluyen en el promedio.`
        : unknownCount === 1
          ? "Una dimensión sin datos (Unknown) se excluye del promedio ponderado."
          : "Promedio ponderado de las cuatro dimensiones.";
  return { version: SCORING_VERSION, tech, client, commercial, practical, overall, overallNote };
}

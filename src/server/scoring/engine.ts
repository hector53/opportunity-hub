import type { AppSettings } from "@/features/settings/types";
import { containsTerm, snippetAround, toHourly } from "@/server/normalization/text";
import type { BudgetPeriod, ClientType, EngagementType } from "@/server/normalization/types";
import type { DimensionResult, ScoreConfidence, ScoreReason, ScoreResult } from "./types";
import { assessEligibility, type GeoEligibility } from "./eligibility";

export const SCORING_VERSION = "det-1.1";

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
  location: string | null;
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
  const configured = settings.preferences.currency.toUpperCase();
  const currency = input.budgetCurrency?.toUpperCase() ?? null;
  // No implicit conversions: amounts are only compared when they're in the configured currency.
  const comparable = amount != null && currency === configured;
  const hourly = comparable ? toHourly(amount, input.budgetPeriod) : null;
  const money = `${amount ?? "?"} ${currency ?? ""}`.trim();
  if (amount != null && !comparable) {
    d.unknown(
      currency
        ? `Presupuesto en ${currency}: no se compara con ${configured} (sin conversión implícita)`
        : `Presupuesto sin moneda declarada: no se compara con ${configured}`,
    );
  } else if (hourly != null) {
    signals = true;
    const ev = `${input.budgetMin ?? "?"}–${input.budgetMax ?? "?"} ${currency}/${input.budgetPeriod} ≈ ${hourly}/h`;
    if (hourly >= targetHourlyRate) d.add(28, `Tarifa ≥ objetivo (${targetHourlyRate}/h)`, ev);
    else if (hourly >= minHourlyRate) d.add(14, `Tarifa dentro del rango aceptable (≥ ${minHourlyRate}/h)`, ev);
    else if (hourly >= minHourlyRate * 0.7) d.add(-15, `Tarifa por debajo del mínimo (${minHourlyRate}/h)`, ev);
    else d.add(-32, "Tarifa muy por debajo del mínimo", ev);
  } else if (comparable && input.budgetPeriod === "fixed") {
    signals = true;
    if (amount < 300) d.add(-20, "Presupuesto fijo muy bajo; riesgo de alcance desproporcionado", money);
    else if (amount < 1000) d.add(-6, "Presupuesto fijo bajo: verificar alcance", money);
    else d.add(6, "Presupuesto fijo razonable", money);
  } else if (comparable) {
    d.unknown(`Presupuesto ${money} sin periodo (hora/mes/fijo)`);
  } else {
    d.unknown("Presupuesto / tarifa");
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

export function scorePractical(input: ScoringInput, settings: AppSettings, eligibility = assessEligibility(input, settings)): DimensionResult {
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

  // Geography comes from the eligibility assessment: only explicit evidence moves the score.
  const first = eligibility.reasons[0];
  if (eligibility.status === "eligible") {
    signals = true;
    d.add(18, `Elegible por ubicación: ${first?.text ?? eligibility.workMode}`, first?.evidence);
  } else if (eligibility.status === "ineligible") {
    signals = true;
    d.add(-45, `No elegible por ubicación: ${first?.text ?? eligibility.workMode}`, first?.evidence);
  } else {
    d.unknown(`Elegibilidad geográfica por revisar (${first?.text ?? "sin datos"})`);
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

/**
 * Confidence reflects how much of the evaluation rests on known data:
 *  high   = all 4 dimensions known and geographic eligibility resolved
 *  medium = 3 dimensions known (Technology must be one of them)
 *  low    = anything less
 */
export function confidenceFor(dims: { tech: number | null; client: number | null; commercial: number | null; practical: number | null }, eligibility: GeoEligibility): ScoreConfidence {
  const known = [dims.tech, dims.client, dims.commercial, dims.practical].filter((v) => v !== null).length;
  if (dims.tech === null) return "low";
  if (known === 4 && eligibility !== "needs_review") return "high";
  if (known >= 3) return "medium";
  return "low";
}

export function scoreOpportunity(input: ScoringInput, settings: AppSettings): ScoreResult {
  const eligibility = assessEligibility(input, settings);
  const tech = scoreTech(input, settings);
  const client = scoreClient(input, settings);
  const commercial = scoreCommercial(input, settings);
  const practical = scorePractical(input, settings, eligibility);
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
        ? `${unknownCount} dimensiones sin datos (Unknown) no se incluyen en el promedio.`
        : unknownCount === 1
          ? "Una dimensión sin datos (Unknown) se excluye del promedio ponderado."
          : "Promedio ponderado de las cuatro dimensiones.";
  const confidence = confidenceFor({ tech: tech.score, client: client.score, commercial: commercial.score, practical: practical.score }, eligibility.status);
  const confidenceNote =
    confidence === "high"
      ? "Confianza alta: las cuatro dimensiones tienen datos y la elegibilidad geográfica está resuelta."
      : confidence === "medium"
        ? "Confianza media: falta una dimensión o la elegibilidad geográfica requiere revisión."
        : "Confianza baja: el score se apoya en poca información; no debe leerse como encaje confirmado.";
  return { version: SCORING_VERSION, tech, client, commercial, practical, overall, overallNote, confidence, confidenceNote, eligibility };
}

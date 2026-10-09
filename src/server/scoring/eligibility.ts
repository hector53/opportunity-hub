import type { AppSettings } from "@/features/settings/types";
import { snippetAround } from "@/server/normalization/text";

/**
 * Geographic eligibility, separate from fit scores.
 *  - eligible:      the post's work mode/location explicitly allows the profile's location.
 *  - ineligible:    there is explicit evidence that excludes it (onsite elsewhere, "US only", ...).
 *  - needs_review:  not enough information. Never treated as incompatible.
 */
export type GeoEligibility = "eligible" | "ineligible" | "needs_review";
export type WorkMode = "fully_remote" | "remote_local" | "remote_unspecified" | "hybrid" | "onsite" | "unknown";

export interface EligibilityReason {
  text: string;
  evidence?: string;
}

export interface EligibilityResult {
  status: GeoEligibility;
  workMode: WorkMode;
  reasons: EligibilityReason[];
}

export interface EligibilityInput {
  title: string;
  description: string;
  remote: boolean | null;
  remoteModality: string | null;
  countries: string[];
  location: string | null;
}

const LATAM_COUNTRIES = [
  "argentina", "bolivia", "brasil", "brazil", "chile", "colombia", "costa rica", "cuba", "ecuador", "el salvador",
  "guatemala", "honduras", "mexico", "méxico", "nicaragua", "panama", "panamá", "paraguay", "peru", "perú",
  "puerto rico", "republica dominicana", "república dominicana", "dominican republic", "uruguay", "venezuela",
];
const LATAM_ALIASES = ["latam", "latin america", "latinoamerica", "latinoamérica", "america latina", "américa latina", "south america", "sudamerica", "sudamérica", "south american"];
const ANYWHERE_RE = /\b(anywhere|worldwide|world-wide|global(ly)? remote|any (country|location|time ?zone)|cualquier (pa[ií]s|lugar|parte del mundo)|desde cualquier lugar)\b/i;
const NOT_A_PLACE = new Set(["remote", "remoto", "remota", "home", "office", "location", "ubicación", "ubicacion"]);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Places that count as "home" for the configured profile (location words + LATAM aliases when applicable). */
export function homePlaces(settings: AppSettings): { terms: string[]; latam: boolean } {
  const loc = norm(settings.profile.location);
  const words = loc.split(/[^a-z]+/).filter((w) => w.length > 3 && !NOT_A_PLACE.has(w));
  const latam = LATAM_COUNTRIES.some((c) => loc.includes(norm(c))) || LATAM_ALIASES.some((a) => loc.includes(norm(a)));
  return { terms: [...new Set(words)], latam };
}

function coversHome(target: string, home: { terms: string[]; latam: boolean }): boolean {
  const t = norm(target);
  if (ANYWHERE_RE.test(t)) return true;
  if (home.terms.some((h) => new RegExp(`\\b${h}\\b`).test(t))) return true;
  if (home.latam && LATAM_ALIASES.some((a) => t.includes(norm(a)))) return true;
  return false;
}

// Explicit restriction statements; group 1 is the allowed place.
const RESTRICTION_PATTERNS: RegExp[] = [
  /\b(?:must|should|need to|needs to|required to|have to)\s+(?:be\s+)?(?:live|living|located|based|reside|residing|resident)\s+(?:in|within)\s+(?:the\s+)?([^.;\n]{2,60})/i,
  /\b(?:only|exclusively)\s+(?:open\s+to\s+|for\s+)?(?:candidates?|applicants?|residents?|people|talent)\s+(?:from|in|of|based in|located in)\s+(?:the\s+)?([^.;\n]{2,60})/i,
  /\b(?:candidates?|applicants?)\s+(?:must\s+be\s+)?(?:from|in|based in|located in)\s+(?:the\s+)?([^.;\n]{2,40}?)\s+only\b/i,
  /\b(?:authorized|eligible|authorization|legally able)\s+to\s+work\s+in\s+(?:the\s+)?([a-z .]{2,30})/i,
  /\b(us|usa|u\.s\.|eu|uk|canada|europe)[- ](?:only|based only|residents only)\b/i,
  /\b([a-z]{2,20}(?: [a-z]{2,20})?)\s+(?:residents?|citizens?)\s+only\b/i,
  /\b(?:s[oó]lo|solamente|[uú]nicamente)\s+(?:para\s+)?(?:residentes|candidatos|personas|postulantes)\s+(?:en|de|que vivan en|residentes en)\s+([^.;\n]{2,60})/i,
  /\b(?:debe[sn]?|deber[aá]s?|es necesario|requisito:?)\s+(?:vivir|residir|estar\s+(?:ubicad[oa]|radicad[oa]|basad[oa]))\s+en\s+([^.;\n]{2,60})/i,
  /\b(?:residir|vivir)\s+en\s+([^.;\n]{2,60})/i,
];
const LOCATION_CONTEXT_RE =
  /\b(live|living|lives|based|located|reside|residing|resident|residents|candidates?|applicants?|talent|from|remote|remotely|hire|hiring|anywhere in|within|across|timezone|time zone|vivir|vivan|residir|residentes|ubicad[oa]s?|radicad[oa]s?|candidat[oa]s|postulantes|desde|remoto|remota|contratamos|talento)\b/;
const CLEARANCE_RE = /\b(security clearance|clearance required|us citizenship required)\b/i;
const TIMEZONE_RE = /\b(time ?zone|EST|PST|CST|ET|PT|UTC[+-]\d|GMT[+-]\d|overlap|horario de)\b/;
const HYBRID_RE = /\b(hybrid|h[ií]brid[oa])\b/i;
const ONSITE_RE = /\b(on-?site|in[- ]office|presencial|en oficina)\b/i;

function workModeOf(input: EligibilityInput, text: string): WorkMode {
  const m = (input.remoteModality ?? "").toLowerCase();
  if (m.includes("hybrid")) return "hybrid";
  if (/no_remote|on_?site|presencial/.test(m)) return "onsite";
  if (m === "fully_remote") return "fully_remote";
  if (m === "remote_local") return "remote_local";
  if (input.remote === false) return HYBRID_RE.test(text) ? "hybrid" : "onsite";
  if (input.remote === true) return HYBRID_RE.test(text) ? "hybrid" : "remote_unspecified";
  if (HYBRID_RE.test(text)) return "hybrid";
  if (ONSITE_RE.test(text) && !/\bremot/i.test(text)) return "onsite";
  return "unknown";
}

export function assessEligibility(input: EligibilityInput, settings: AppSettings): EligibilityResult {
  const text = `${input.title}\n${input.description}`;
  const home = homePlaces(settings);
  const reasons: EligibilityReason[] = [];
  const workMode = workModeOf(input, text);

  // Evidence about allowed places
  const allows: EligibilityReason[] = [];
  const excludes: EligibilityReason[] = [];
  const anywhere = text.match(ANYWHERE_RE);
  if (anywhere) allows.push({ text: "Acepta candidatos de cualquier ubicación", evidence: snippetAround(text, anywhere.index ?? 0, 50) });
  if (home.latam) {
    // Only a LATAM mention in a location context counts ("must live in Latin America", "remote from LATAM"),
    // not e.g. "we sell to customers in LATAM".
    const n = norm(text);
    for (const alias of LATAM_ALIASES) {
      const i = n.indexOf(norm(alias));
      if (i < 0) continue;
      const window = n.slice(Math.max(0, i - 70), i + alias.length + 30);
      if (LOCATION_CONTEXT_RE.test(window)) {
        allows.push({ text: "Admite candidatos de LATAM, que incluye tu ubicación", evidence: snippetAround(text, i, 50) });
        break;
      }
    }
  }
  for (const re of RESTRICTION_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const target = m[1] ?? m[0];
    const reason = { text: `Restricción explícita: «${target.trim()}»`, evidence: snippetAround(text, m.index ?? 0, 60) };
    if (coversHome(target, home)) allows.push({ ...reason, text: `Restricción que incluye tu ubicación: «${target.trim()}»` });
    else excludes.push(reason);
  }
  const clearance = text.match(CLEARANCE_RE);
  if (clearance && !home.terms.some((t) => ["usa", "united", "states"].includes(t))) {
    excludes.push({ text: "Requiere autorización/ciudadanía de EE. UU.", evidence: snippetAround(text, clearance.index ?? 0, 50) });
  }
  const places = [...input.countries, input.location ?? ""].map((c) => c.trim()).filter((c) => c && !/^remot[eo]$/i.test(c));
  const listed = places.find((c) => coversHome(c, home));
  if (listed) allows.push({ text: `Ubicación listada compatible: ${listed}` });

  const tz = text.match(TIMEZONE_RE);
  const tzNote = tz ? { text: "Pide solapamiento horario (no excluye por ubicación; verifica horario)", evidence: snippetAround(text, tz.index ?? 0, 40) } : null;

  let status: GeoEligibility;
  if (workMode === "onsite" || workMode === "hybrid") {
    const label = workMode === "onsite" ? "Presencial" : "Híbrido";
    if (listed || allows.length) {
      status = "needs_review";
      reasons.push({ text: `${label} en una ubicación que podría ser la tuya: verifica ciudad y frecuencia` }, ...allows);
    } else if (places.length || excludes.length) {
      status = "ineligible";
      reasons.push({ text: places.length ? `${label} en ${places.join(", ")}` : `${label} con restricción de ubicación`, evidence: input.remoteModality ?? undefined }, ...excludes);
    } else {
      status = "needs_review";
      reasons.push({ text: `${label} sin ubicación especificada` });
    }
  } else if (excludes.length && !allows.length) {
    status = "ineligible";
    reasons.push(...excludes);
  } else if (allows.length) {
    status = "eligible";
    reasons.push(...allows);
    if (excludes.length) reasons.push(...excludes.map((e) => ({ ...e, text: `${e.text} (contradicción: revisa)` })));
  } else if (workMode === "fully_remote") {
    status = "eligible";
    reasons.push({ text: "Totalmente remoto, sin restricción geográfica explícita", evidence: input.remoteModality ?? undefined });
  } else if (workMode === "remote_unspecified") {
    status = "eligible";
    reasons.push({ text: "Remoto, sin restricción geográfica mencionada" });
  } else if (workMode === "remote_local") {
    status = "needs_review";
    reasons.push({ text: "Remoto restringido a ciertos países (remote_local) y no consta si incluye tu ubicación", evidence: "remote_local" });
  } else {
    status = "needs_review";
    reasons.push({ text: "No se indica si es remoto ni desde dónde se puede trabajar" });
  }
  if (tzNote) reasons.push(tzNote);
  return { status, workMode, reasons };
}

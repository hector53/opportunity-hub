import type { BudgetPeriod, ClientType, EngagementType } from "./types";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Converts untrusted HTML into plain text. Output is only ever rendered as text, never as HTML. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? (/^&#\d+;$/.test(e) ? String.fromCharCode(Number(e.slice(2, -1))) : " "))
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

const TRACKING_PARAMS = /^(utm_|ref$|ref_|source$|fbclid$|gclid$|mc_|trk$|referrer$)/i;

/** Canonical URL used for deduplication: lowercase host, no tracking params, no hash, no trailing slash. */
export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.protocol = "https:";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  const s = url.toString();
  return s.endsWith("/") && !url.search ? s.slice(0, -1) : s;
}

export function isSafeHttpUrl(input: string | null | undefined): boolean {
  return normalizeUrl(input) !== null;
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|s\.?a\.?|spa|s\.?a\.?s|corp|gmbh|limited|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ES_WORDS = ["el", "la", "los", "las", "de", "que", "para", "con", "una", "por", "proyecto", "desarrollo", "necesitamos", "buscamos", "experiencia"];
const EN_WORDS = ["the", "and", "for", "with", "you", "we", "are", "our", "will", "project", "looking", "experience", "need"];
const PT_WORDS = ["você", "não", "para", "com", "uma", "projeto", "desenvolvimento", "experiência", "estamos", "vaga"];

/** Cheap stopword-based language guess. Returns null when there isn't enough signal. */
export function detectLanguage(text: string): "es" | "en" | "pt" | null {
  const words = text.toLowerCase().match(/[a-záéíóúñãõçê]+/g);
  if (!words || words.length < 8) return null;
  const count = (list: string[]) => words.reduce((n, w) => n + (list.includes(w) ? 1 : 0), 0);
  const scores = { es: count(ES_WORDS), en: count(EN_WORDS), pt: count(PT_WORDS) * 1.2 };
  const best = (Object.entries(scores) as ["es" | "en" | "pt", number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 3 ? best[0] : null;
}

const HOURS_PER_MONTH = 160;
const HOURS_PER_YEAR = 1920;

/** Converts a budget/salary to an approximate hourly figure. Fixed-price and unknown periods return null. */
export function toHourly(amount: number | null | undefined, period: BudgetPeriod): number | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  switch (period) {
    case "hour":
      return amount;
    case "month":
      return Math.round((amount / HOURS_PER_MONTH) * 10) / 10;
    case "year":
      return Math.round((amount / HOURS_PER_YEAR) * 10) / 10;
    default:
      return null;
  }
}

export interface ParsedBudget {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: BudgetPeriod;
  evidence: string | null;
}

/**
 * Best-effort budget extraction from free text (manual imports). Only picks values explicitly
 * tied to a currency marker; anything ambiguous is left as unknown.
 */
export function parseBudgetFromText(text: string): ParsedBudget {
  const re =
    /(USD|US\$|\$|EUR|€)\s?(\d{1,3}(?:[.,]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?[kK])?(?:\s?(?:-|–|to|a|hasta)\s?(?:USD|US\$|\$|EUR|€)?\s?(\d{1,3}(?:[.,]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?[kK])?)?\s*(?:\/|per|por|al|a la|an?)?\s*(hour|hr|h\b|hora|month|mes|mensual|year|año|annual|anual|fixed|fijo)?/i;
  const m = text.match(re);
  if (!m) return { min: null, max: null, currency: null, period: "unknown", evidence: null };
  const k = /k/i.test(m[0]);
  const num = (s?: string) => {
    if (!s) return null;
    const n = Number(s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(n) ? n * (k ? 1000 : 1) : null;
  };
  const cur = /EUR|€/i.test(m[1]) ? "EUR" : "USD";
  const p = (m[4] ?? "").toLowerCase();
  let period: BudgetPeriod = "unknown";
  if (/^(hour|hr|h|hora)/.test(p)) period = "hour";
  else if (/^(month|mes|mensual)/.test(p)) period = "month";
  else if (/^(year|año|annual|anual)/.test(p)) period = "year";
  else if (/^(fixed|fijo)/.test(p)) period = "fixed";
  return { min: num(m[2]), max: num(m[3]) ?? num(m[2]), currency: cur, period, evidence: m[0].trim() };
}

export function inferEngagement(text: string): { value: EngagementType; evidence: string | null } {
  const rules: [RegExp, EngagementType][] = [
    [/\bfractional\b|\b\d{1,2}\s?[-–]\s?\d{1,2}\s?(hrs?|hours|horas)\s?(\/|per|por|a la|a)\s?(week|semana)/i, "fractional"],
    [/\bpart[- ]?time\b|medio tiempo|tiempo parcial/i, "part_time"],
    [/\bfull[- ]?time\b|tiempo completo|jornada completa/i, "full_time"],
    [/\bfreelanc|\bproyecto (puntual|freelance)|fixed[- ]price|precio fijo/i, "freelance"],
    [/\bcontract(or)?\b|contrato por proyecto/i, "contract"],
  ];
  for (const [re, value] of rules) {
    const m = text.match(re);
    if (m) return { value, evidence: m[0] };
  }
  return { value: "unknown", evidence: null };
}

export function inferHoursPerWeek(text: string): number | null {
  const m = text.match(/(\d{1,2})\s?(?:[-–]\s?(\d{1,2}))?\s?(?:hrs?|hours|horas)\s?(?:\/|per|por|a la|a)\s?(?:week|semana)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const v = Math.round((a + b) / 2);
  return v > 0 && v <= 60 ? v : null;
}

// Company-level descriptors (company name/description): broader vocabulary is acceptable here.
const COMPANY_RULES: [RegExp, ClientType][] = [
  [/\b(recruiting|recruitment|staffing|headhunt\w*|talent (acquisition|solutions|partners?) (firm|agency|company)|reclutamiento y selecci[oó]n|consultora de (rrhh|reclutamiento))\b/i, "recruiter"],
  [/\b(digital agency|software agency|dev(elopment)? agency|agencia (digital|de software|de desarrollo)|software factory|f[áa]brica de software|consultora (tecnol[oó]gica|de software|ti)|it consulting|software consult\w+|nearshore|outsourcing)\b/i, "agency"],
  [/\b(startup|start-up|seed[- ]stage|pre-?seed|series [ab]|y combinator)\b/i, "startup"],
  [/\b(fortune 500|multinational|multinacional|\d{1,3}[.,]?\d{3}\+? (employees|empleados))\b/i, "enterprise"],
];

// Job-text descriptors: only explicit self-descriptions, to avoid matching incidental words.
const JOB_RULES: [RegExp, ClientType][] = [
  [/\b(on behalf of (our|a|one of our) clients?|our client is|para (un|una|nuestro) (importante )?cliente|en representaci[oó]n de|nuestro cliente (es|busca))\b/i, "recruiter"],
  [/\b(we are an? (digital |software |development |dev )?(agency|consultancy|software house)|somos una (agencia|consultora|software factory))\b/i, "agency"],
  [/\b(i'?m (the )?(founder|co-?founder)|soy (el |la )?(fundador|fundadora|cofundador|cofundadora)|our founder|founder[- ]led|solo founder)\b/i, "founder"],
  [/\b(we are an? (early[- ]stage |small |seed[- ]stage )?startup|somos una startup|early[- ]stage startup)\b/i, "startup"],
];

/**
 * Infers a client type. Explicit self-descriptions in the job text win; otherwise the company
 * description is used. Always an inference — never presented as a confirmed fact.
 */
export function inferClientType(jobText: string, companyText = ""): { value: ClientType; evidence: string | null } {
  for (const [re, value] of JOB_RULES) {
    const m = jobText.match(re);
    if (m) return { value, evidence: m[0] };
  }
  for (const [re, value] of COMPANY_RULES) {
    const m = companyText.match(re);
    if (m) return { value, evidence: `Empresa: ${m[0]}` };
  }
  return { value: "unknown", evidence: null };
}

const SECTORS: [RegExp, string][] = [
  [/\b(fintech|trading|banking|payments|pagos|finanzas|crypto exchange|market data)\b/i, "fintech"],
  [/\b(health|healthtech|salud|clinic|cl[ií]nica|medical|m[eé]dico|patients?|pacientes?)\b/i, "healthtech"],
  [/\b(llm|gpt|openai|ai agent|agentes? de ia|machine learning|inteligencia artificial|generative ai|rag)\b/i, "ai"],
  [/\b(saas|subscription|suscripci[oó]n|multi-?tenant)\b/i, "saas"],
  [/\b(e-?commerce|shopify|tienda online|marketplace)\b/i, "ecommerce"],
  [/\b(edtech|education|educaci[oó]n|lms|e-?learning)\b/i, "edtech"],
  [/\b(b2b)\b/i, "b2b"],
];

export function inferSector(text: string): string | null {
  for (const [re, s] of SECTORS) if (re.test(text)) return s;
  return null;
}

/** Common technology vocabulary used to extract skills from free text. */
export const TECH_VOCABULARY = [
  "typescript", "javascript", "node.js", "node", "nestjs", "express", "react", "next.js", "nextjs", "vue", "nuxt", "angular",
  "svelte", "postgresql", "postgres", "mysql", "mongodb", "redis", "graphql", "rest", "docker", "kubernetes", "aws", "gcp",
  "azure", "linux", "websockets", "socket.io", "python", "fastapi", "django", "flask", "php", "laravel", "ruby", "rails",
  "java", "spring", "kotlin", "swift", "flutter", "react native", "go", "golang", "rust", ".net", "c#", "c++", "scala",
  "elixir", "salesforce", "sap", "stripe", "openai", "llm", "rag", "langchain", "pgvector", "tailwind", "prisma", "drizzle",
  "terraform", "solidity", "web3", "wordpress", "shopify", "figma", "unity",
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTerm(text: string, term: string): boolean {
  const t = term.toLowerCase();
  // Word-ish boundary that also works for terms like ".net", "c#", "node.js"
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t)}(?=$|[^a-z0-9])`, "i");
  return re.test(text);
}

export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found = TECH_VOCABULARY.filter((t) => {
    if (t === "go") return /\bgo(lang)?\b(?! to| ahead| live| through)/i.test(text) && /\bgolang\b|\bgo developer\b|\bin go\b|\bgo,/i.test(text);
    if (t === "rest") return /\brest(ful)?\b\s*(api)?/i.test(text) && /\brest(ful)?\s*api/i.test(text);
    return containsTerm(lower, t);
  });
  return [...new Set(found)];
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function snippetAround(text: string, index: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

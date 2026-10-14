import { snippetAround } from "@/server/normalization/text";

/**
 * Security Gate — static, text-only risk detection.
 *
 * Hard guarantees of this module (and of Opportunity Hub in general):
 *  - It never clones, downloads, installs, builds or executes anything referenced by an opportunity.
 *  - It never follows links or opens attachments. It only reads text that is already stored.
 *  - A flag is a signal for human review, not proof of fraud.
 */

export type RiskType =
  | "external_repository"
  | "executable_test"
  | "unusual_links"
  | "crypto_wallet"
  | "credentials_request"
  | "payment_outside_platform"
  | "suspicious_communication"
  | "unpaid_assessment";

export type RiskSeverity = "info" | "warning" | "high";
export type RiskLevel = "none" | "low" | "medium" | "high";

export interface RiskFinding {
  type: RiskType;
  severity: RiskSeverity;
  rule: string;
  evidence: string;
}

export const RISK_LABELS: Record<RiskType, string> = {
  external_repository: "External repository or ZIP",
  executable_test: "Executable technical test",
  unusual_links: "Unusual external links",
  crypto_wallet: "Crypto/wallet request",
  credentials_request: "Requests for credentials",
  payment_outside_platform: "Payment outside platform",
  suspicious_communication: "Suspicious communication",
  unpaid_assessment: "Unreasonable unpaid assessment",
};

export const RISK_ADVICE: Record<RiskType, string> = {
  external_repository:
    "No clones ni abras el repositorio/ZIP en tu máquina de trabajo. Si es imprescindible revisarlo, hazlo en una VM desechable sin credenciales y sólo con análisis estático.",
  executable_test:
    "No ejecutes npm/yarn/pnpm install, build ni scripts de un repositorio de terceros. Configs como postcss/next/vite/babel pueden ejecutar código al compilar.",
  unusual_links: "Verifica el dominio antes de abrir. Evita acortadores y archivos ejecutables.",
  crypto_wallet: "Nunca conectes una wallet ni compartas seed phrases/claves privadas.",
  credentials_request: "Nunca compartas contraseñas, tokens, 2FA ni documentos personales por este canal.",
  payment_outside_platform:
    "Salir de la plataforma elimina la protección de pago. Evalúa con cuidado antes de aceptar.",
  suspicious_communication: "Comunicación con patrones de presión, urgencia o instrucciones anómalas. Verifica la identidad del cliente.",
  unpaid_assessment: "Evalúa si la prueba es razonable en tiempo. Puedes proponer una prueba pagada o una muestra de trabajo previo.",
};

interface Rule {
  id: string;
  type: RiskType;
  severity: RiskSeverity;
  re: RegExp;
}

const RULES: Rule[] = [
  // External repositories / archives
  { id: "repo-host-link", type: "external_repository", severity: "warning", re: /\b(?:https?:\/\/)?(?:www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+/i },
  { id: "clone-instruction", type: "external_repository", severity: "warning", re: /\bgit\s+clone\b|\bclone (the|our|this) (repo|repository)\b|clon(a|ar|en) (el|nuestro) repositorio/i },
  { id: "archive-file", type: "external_repository", severity: "warning", re: /\b[\w-]+\.(zip|rar|7z|tar\.gz|tgz)\b/i },
  { id: "download-project", type: "external_repository", severity: "warning", re: /\bdownload (the|our|this) (project|code|repo)|descarg(a|ar|ue) (el|nuestro) (proyecto|c[oó]digo|repositorio)/i },

  // Executable tests
  { id: "install-run", type: "executable_test", severity: "high", re: /\b(npm|yarn|pnpm|bun)\s+(i|install|run|start|dev|build)\b|\bpip install\b|\bdocker[- ]compose up\b/i },
  { id: "run-project", type: "executable_test", severity: "warning", re: /\b(run|execute|start|build) (the|our|this) (project|app|code|repo)|(ejecut|corr|levant|compil)(a|ar|e) (el|nuestro) (proyecto|c[oó]digo|repositorio|app)/i },
  { id: "fix-bug-repo", type: "executable_test", severity: "warning", re: /\b(fix|debug) (the|a) (bug|issue|error)s? in (the|our|this) (repo|project|codebase)/i },

  // Unusual links
  { id: "url-shortener", type: "unusual_links", severity: "warning", re: /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|rb\.gy|cutt\.ly|shorturl\.at)\/\S+/i },
  { id: "raw-ip-url", type: "unusual_links", severity: "high", re: /\bhttps?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/i },
  { id: "executable-file", type: "unusual_links", severity: "high", re: /\b[\w-]+\.(exe|msi|dmg|pkg|scr|bat|cmd|ps1|apk|jar|vbs|iso)\b/i },
  { id: "file-share-link", type: "unusual_links", severity: "info", re: /\b(drive\.google\.com|dropbox\.com|wetransfer\.com|mega\.nz|mediafire\.com)\/\S+/i },

  // Crypto / wallet
  { id: "wallet-connect", type: "crypto_wallet", severity: "high", re: /\b(connect (your )?wallet|seed phrase|recovery phrase|private key|metamask|trust wallet|frase semilla|clave privada|conecta(r)? (tu )?wallet)\b/i },
  { id: "crypto-payment", type: "crypto_wallet", severity: "warning", re: /\b(pay(ment)? in (usdt|btc|eth|crypto)|send (usdt|btc|eth)|pago en (usdt|cripto|btc))\b/i },

  // Credentials
  { id: "credentials", type: "credentials_request", severity: "high", re: /\b(send|share|provide|env[ií]a(me)?|comparte|facilita) (me )?(your |tu |sus )?(password|contrase[ñn]a|login|credenciales|credentials|2fa|otp|verification code|c[oó]digo de verificaci[oó]n)\b/i },
  { id: "identity-docs", type: "credentials_request", severity: "warning", re: /\b(ssn|social security number|passport (copy|scan)|copia (de tu|del) (pasaporte|c[eé]dula)|bank account (details|number) (before|upfront))\b/i },
  { id: "account-rental", type: "credentials_request", severity: "high", re: /\b(rent|use|borrow) your (upwork|freelancer|linkedin|github) account|alquil(a|ar) tu cuenta/i },

  // Payment outside platform
  { id: "off-platform", type: "payment_outside_platform", severity: "warning", re: /\b(outside (of )?(upwork|workana|the platform)|off[- ]platform|avoid (the )?(upwork|platform) fees|fuera de (la plataforma|upwork|workana)|evitar (la )?comisi[oó]n)\b/i },
  { id: "move-chat", type: "payment_outside_platform", severity: "info", re: /\b(contact me|add me|write me|escr[ií]beme|cont[aá]ctame|agr[eé]game) (on|at|by|en|por|al) (telegram|whatsapp|signal|skype|discord|wechat)\b/i },

  // Suspicious communication / prompt injection
  { id: "prompt-injection", type: "suspicious_communication", severity: "high", re: /\b(ignore (all |any )?(previous|prior|above) (instructions|prompts)|disregard (the )?(system|previous) (prompt|instructions)|you are (now )?(an?|the) (ai|assistant|model)|ignora (las |todas las )?instrucciones (anteriores|previas)|system prompt)\b/i },
  { id: "urgency-pressure", type: "suspicious_communication", severity: "info", re: /\b(urgent(ly)?|asap|immediately|right now|within (the next )?\d+ (minutes|hours)|urgente|inmediatamente|de inmediato)\b/i },
  { id: "too-good", type: "suspicious_communication", severity: "warning", re: /\b(no experience (needed|required)|guaranteed (income|payment)|easy money|dinero f[aá]cil|ingresos garantizados)\b/i },
  { id: "pay-to-apply", type: "suspicious_communication", severity: "high", re: /\b(pay (a|the) (fee|deposit) (to|before)|registration fee|training fee|cuota de (inscripci[oó]n|registro)|pagar (una|un) (dep[oó]sito|cuota))\b/i },

  // Unpaid assessments
  { id: "unpaid-test", type: "unpaid_assessment", severity: "warning", re: /\b(unpaid (test|trial|task|assignment)|free (test|trial task|sample project)|prueba (t[eé]cnica )?(no remunerada|gratuita|sin pago))\b/i },
  { id: "build-full", type: "unpaid_assessment", severity: "warning", re: /\b(take[- ]home|test task|prueba t[eé]cnica|challenge)\b[\s\S]{0,120}\b(build|create|develop|construir|desarrollar|crear) (a |an |the |una? )?(full|complete|entire|whole|completa|completo|full-stack)\b/i },
  { id: "long-test", type: "unpaid_assessment", severity: "warning", re: /\b(take[- ]home|test|assignment|prueba)\b[^.]{0,80}\b([5-9]|\d{2,})\s?(hours|horas|days|d[ií]as)\b/i },
];

const SEVERITY_RANK: Record<RiskSeverity, number> = { info: 1, warning: 2, high: 3 };

/** Runs all rules against untrusted text. Evidence is a short text snippet, never executed or fetched. */
export function detectRisks(text: string): RiskFinding[] {
  if (!text) return [];
  const findings: RiskFinding[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const key = `${rule.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ type: rule.type, severity: rule.severity, rule: rule.id, evidence: snippetAround(text, m.index, 70) });
  }
  // Repo link + run/install instructions together is the classic malicious take-home pattern.
  const hasRepo = findings.some((f) => f.type === "external_repository");
  const hasExec = findings.some((f) => f.type === "executable_test");
  if (hasRepo && hasExec) {
    findings.push({
      type: "executable_test",
      severity: "high",
      rule: "repo-plus-execution",
      evidence: "Combina repositorio/archivo externo con instrucciones de instalar o ejecutar código.",
    });
  }
  return findings;
}

export function riskLevelFor(findings: Pick<RiskFinding, "severity">[]): RiskLevel {
  if (!findings.length) return "none";
  const max = Math.max(...findings.map((f) => SEVERITY_RANK[f.severity]));
  const warnings = findings.filter((f) => f.severity === "warning").length;
  if (max === 3) return "high";
  if (max === 2) return warnings >= 3 ? "high" : "medium";
  return "low";
}

// ---------- URL analysis (static: URLs are parsed, never fetched or opened) ----------

const PLATFORM_HOSTS: Record<string, string[]> = {
  upwork: ["upwork.com"],
  workana: ["workana.com"],
  getonboard: ["getonbrd.com", "getonboard.com"],
};
const SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "rb.gy", "cutt.ly", "shorturl.at", "ow.ly", "buff.ly", "t.ly", "s.id"];
const REPO_HOSTS = ["github.com", "gitlab.com", "bitbucket.org", "raw.githubusercontent.com", "gist.github.com"];
const FILE_SHARE_HOSTS = ["drive.google.com", "docs.google.com", "dropbox.com", "wetransfer.com", "we.tl", "mega.nz", "mediafire.com"];
const EXECUTABLE_EXT = /\.(exe|msi|dmg|pkg|scr|bat|cmd|ps1|apk|jar|vbs|iso|sh|app|deb|rpm)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|tgz|gz|bz2|xz)$/i;

const hostMatches = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

export interface UrlContext {
  /** Where the URL came from, shown in the evidence (e.g. "originalUrl", "mensaje"). */
  field: string;
  /** When set, the URL is expected to belong to this platform's domain. */
  expectedSource?: string | null;
}

/** Static analysis of a single URL. Never resolves DNS, follows redirects or downloads anything. */
export function analyzeUrl(raw: string | null | undefined, ctx: UrlContext): RiskFinding[] {
  if (!raw || !raw.trim()) return [];
  const value = raw.trim();
  const ev = (detail: string) => `${ctx.field}: ${value.length > 160 ? `${value.slice(0, 159)}…` : value} — ${detail}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [{ type: "unusual_links", severity: "warning", rule: "url-unparseable", evidence: ev("URL no válida") }];
  }
  const out: RiskFinding[] = [];
  const push = (type: RiskType, severity: RiskSeverity, rule: string, detail: string) => out.push({ type, severity, rule, evidence: ev(detail) });

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    push("unusual_links", "high", "url-scheme", `esquema no permitido (${url.protocol})`);
    return out;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = decodeURIComponent(url.pathname).toLowerCase();

  if (url.protocol === "http:") push("unusual_links", "info", "url-insecure-http", "usa http sin cifrar");
  if (url.username || url.password) push("unusual_links", "warning", "url-embedded-credentials", "incluye usuario/contraseña en la URL");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) push("unusual_links", "high", "url-raw-ip", "apunta a una IP en lugar de un dominio");
  if (host.split(".").some((label) => label.startsWith("xn--"))) push("unusual_links", "warning", "url-punycode", "dominio punycode (posible suplantación visual)");
  if (hostMatches(host, SHORTENER_HOSTS)) push("unusual_links", "warning", "url-shortener", "acortador que oculta el destino real");
  if (EXECUTABLE_EXT.test(path)) push("unusual_links", "high", "url-executable", "enlaza un archivo ejecutable");
  else if (ARCHIVE_EXT.test(path)) push("external_repository", "warning", "url-archive", "enlaza un archivo comprimido");
  if (hostMatches(host, REPO_HOSTS)) push("external_repository", "warning", "url-repository", "enlaza un repositorio de código");
  if (hostMatches(host, FILE_SHARE_HOSTS)) push("unusual_links", "info", "url-file-share", "enlaza un servicio de archivos compartidos");

  const expected = ctx.expectedSource ? PLATFORM_HOSTS[ctx.expectedSource] : undefined;
  if (expected && !hostMatches(host, expected)) {
    push("unusual_links", "warning", "url-platform-mismatch", `el dominio no pertenece a ${expected.join(" / ")}`);
  }
  return out;
}

const TEXT_LINK_EXTRA_RULES = new Set(["url-embedded-credentials", "url-punycode"]);

/** Extracts http(s) URLs from free text (for notification bodies). */
export function extractUrls(text: string, max = 20): string[] {
  const found = text.match(/\bhttps?:\/\/[^\s<>"'()\[\]{}]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))].slice(0, max);
}

/**
 * Full static analysis of a record: text rules + explicit URL fields + links found in the text.
 * Platform-domain checks apply only to explicit URL fields (links inside a message may legitimately point elsewhere).
 */
export function detectContentRisks(input: { text: string; urls?: { field: string; url: string | null | undefined; expectedSource?: string | null }[]; scanTextLinks?: boolean }): RiskFinding[] {
  const findings = detectRisks(input.text).filter((f) => f.rule !== "repo-plus-execution");
  const seen = new Set(findings.map((f) => `${f.rule}|${f.evidence}`));
  const add = (f: RiskFinding) => {
    const key = `${f.rule}|${f.evidence}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push(f);
    }
  };
  for (const u of input.urls ?? []) for (const f of analyzeUrl(u.url, { field: u.field, expectedSource: u.expectedSource })) add(f);
  if (input.scanTextLinks) {
    const explicit = new Set((input.urls ?? []).map((u) => u.url?.trim()));
    // Text rules already cover shorteners, IPs, executables, repos and file shares inside the text;
    // links found there only add the URL-structure checks the text rules can't see.
    for (const link of extractUrls(input.text)) {
      if (explicit.has(link)) continue;
      for (const f of analyzeUrl(link, { field: "enlace en el texto" })) if (TEXT_LINK_EXTRA_RULES.has(f.rule)) add(f);
    }
  }
  const hasRepo = findings.some((f) => f.type === "external_repository");
  const hasExec = findings.some((f) => f.type === "executable_test");
  if (hasRepo && hasExec) {
    findings.push({
      type: "executable_test",
      severity: "high",
      rule: "repo-plus-execution",
      evidence: "Combina repositorio/archivo externo con instrucciones de instalar o ejecutar código.",
    });
  }
  return findings;
}

/** True when content contains text attempting to instruct an AI model. */
export function looksLikePromptInjection(text: string): boolean {
  return RULES.find((r) => r.id === "prompt-injection")!.re.test(text);
}

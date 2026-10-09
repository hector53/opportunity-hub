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

/** True when content contains text attempting to instruct an AI model. */
export function looksLikePromptInjection(text: string): boolean {
  return RULES.find((r) => r.id === "prompt-injection")!.re.test(text);
}

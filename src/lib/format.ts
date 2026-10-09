export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function relTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  if (abs < 30 * 86400_000) return rtf.format(Math.round(diff / 86400_000), "day");
  return fmtDate(date);
}

const PERIOD: Record<string, string> = { hour: "/h", month: "/mes", year: "/año", fixed: " fijo", unknown: "" };

export function fmtMoney(min: number | null, max: number | null, currency: string | null, period: string): string {
  if (min == null && max == null) return "Unknown";
  const c = currency ?? "";
  const f = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));
  const range = min != null && max != null && min !== max ? `${f(min)}–${f(max)}` : f((max ?? min)!);
  return `${c === "USD" ? "$" : `${c} `}${range}${PERIOD[period] ?? ""}`;
}

export const CLIENT_TYPE_LABEL: Record<string, string> = {
  founder: "Founder",
  startup: "Startup",
  smb: "Pyme",
  agency: "Agencia",
  recruiter: "Recruiter",
  enterprise: "Enterprise",
  unknown: "Unknown",
};

export const ENGAGEMENT_LABEL: Record<string, string> = {
  freelance: "Freelance",
  fractional: "Fractional",
  contract: "Contrato",
  part_time: "Part-time",
  full_time: "Full-time",
  unknown: "Unknown",
};

export const SOURCE_LABEL: Record<string, string> = {
  getonboard: "Get on Board",
  upwork: "Upwork",
  workana: "Workana",
  email: "Email",
  manual: "Manual",
};

export const OPP_STATUS_LABEL: Record<string, string> = {
  new: "Nueva",
  reviewing: "En revisión",
  saved: "Guardada",
  applied: "Aplicada",
  discarded: "Descartada",
  archived: "Archivada",
};

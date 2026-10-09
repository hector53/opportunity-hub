import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("card", className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "demo";
const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface-2 text-muted",
  accent: "border-accent/30 bg-accent-soft text-accent",
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  bad: "border-bad/30 bg-bad/10 text-bad",
  demo: "border-demo/40 bg-demo/10 text-demo",
};

export function Badge({ children, tone = "neutral", title, className }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="demo" title="Registro sintético de demostración, no es una oportunidad real">
      Demo
    </Badge>
  );
}

export function scoreTone(v: number | null | undefined): Tone {
  if (v == null) return "neutral";
  if (v >= 75) return "ok";
  if (v >= 55) return "accent";
  if (v >= 40) return "warn";
  return "bad";
}

export function ScorePill({ value, label }: { value: number | null | undefined; label?: string }) {
  return (
    <Badge tone={scoreTone(value)} title={label} className="min-w-9 justify-center tabular-nums">
      {value == null ? "?" : value}
    </Badge>
  );
}

const RISK_TONE: Record<string, Tone> = { none: "neutral", low: "accent", medium: "warn", high: "bad" };
const RISK_LABEL: Record<string, string> = { none: "Sin alertas", low: "Bajo", medium: "Medio", high: "Alto" };

export function RiskBadge({ level }: { level: string }) {
  return <Badge tone={RISK_TONE[level] ?? "neutral"}>{RISK_LABEL[level] ?? level}</Badge>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const inner = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </>
  );
  return href ? (
    <a href={href} className="card block px-4 py-3 transition-colors hover:border-line-strong">
      {inner}
    </a>
  ) : (
    <div className="card px-4 py-3">{inner}</div>
  );
}

export function Field({ label, htmlFor, children, hint, className }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-subtle">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "accent", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cn("rounded-md border px-3 py-2 text-sm", TONES[tone])}>{children}</div>;
}

export function ProvenanceTag({ kind, note }: { kind?: string; note?: string }) {
  if (!kind) return <Badge title="No proporcionado por la fuente">Unknown</Badge>;
  const map: Record<string, [string, Tone]> = {
    source: ["Fuente", "ok"],
    manual: ["Manual", "accent"],
    inferred: ["Inferido", "warn"],
  };
  const [label, tone] = map[kind] ?? [kind, "neutral"];
  return (
    <Badge tone={tone} title={note}>
      {label}
    </Badge>
  );
}

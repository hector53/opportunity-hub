import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge, Card, ProvenanceTag, ScorePill, scoreTone } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/cn";
import { CLIENT_TYPE_LABEL, ENGAGEMENT_LABEL, fmtDate, fmtMoney, SOURCE_LABEL } from "@/lib/format";
import { RISK_ADVICE, RISK_LABELS, type RiskType } from "@/server/security/risk-rules";
import type { DimensionResult, ScoreReasons } from "@/server/scoring/types";
import type { FieldProvenance } from "@/server/normalization/types";
import { allowedTransitions, STATUS_LABELS, type ApplicationStatus } from "@/features/applications/state-machine";
import { addApplicationCommentAction, createApplicationAction, moveApplicationAction, updateApplicationAction } from "@/features/applications/actions";
import { saveProposalVersionAction, setProposalStatusAction } from "@/features/proposals/actions";
import { dismissRiskAction, rescoreAction, updateOpportunityAction } from "./actions";
import type { getOpportunityDetail } from "./queries";

type Detail = NonNullable<Awaited<ReturnType<typeof getOpportunityDetail>>>;

const DIMENSIONS: { key: keyof Omit<ScoreReasons, "overallNote">; label: string; help: string }[] = [
  { key: "tech", label: "Technology / Job Fit", help: "Encaje técnico y capacidad de entrega" },
  { key: "client", label: "Client Fit", help: "Tipo de cliente y potencial de relación" },
  { key: "commercial", label: "Commercial Fit", help: "Tarifa, duración, recurrencia y claridad" },
  { key: "practical", label: "Practical Fit", help: "Idioma, ubicación, horario, disponibilidad" },
];

function DimensionBlock({ label, help, d }: { label: string; help: string; d: DimensionResult }) {
  return (
    <details className="group rounded-md border border-line bg-bg/40" open={d.score !== null && d.score < 50}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <span>
          <span className="text-sm font-medium">{label}</span>
          <span className="block text-[11px] text-subtle">{help}</span>
        </span>
        <span className="flex items-center gap-2">
          <ScoreBar value={d.score} />
          <ScorePill value={d.score} />
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-line px-3 py-2 text-xs">
        {d.score === null ? <p className="text-warn">Unknown: no hay datos suficientes. No se estima.</p> : null}
        {d.reasons.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className={cn("w-9 shrink-0 text-right tabular-nums", r.impact > 0 ? "text-ok" : r.impact < 0 ? "text-bad" : "text-subtle")}>
              {r.impact > 0 ? `+${r.impact}` : r.impact === 0 ? "·" : r.impact}
            </span>
            <span>
              {r.text}
              {r.evidence ? <span className="mt-0.5 block font-mono text-[11px] break-words text-subtle">“{r.evidence}”</span> : null}
            </span>
          </div>
        ))}
        {d.unknowns.length ? <p className="pt-1 text-subtle">Sin datos: {d.unknowns.join(" · ")}</p> : null}
      </div>
    </details>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  const tone = scoreTone(value);
  const color = { ok: "bg-ok", accent: "bg-accent", warn: "bg-warn", bad: "bg-bad", neutral: "bg-line-strong", demo: "bg-demo" }[tone];
  return (
    <span className="hidden h-1.5 w-20 overflow-hidden rounded bg-surface-3 sm:block" aria-hidden>
      <span className={cn("block h-full", color)} style={{ width: `${value ?? 0}%` }} />
    </span>
  );
}

export function ScoresCard({ d }: { d: Detail }) {
  const reasons = d.score?.reasons;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Evaluación <ScorePill value={d.opp.overallScore} label="Score global" />
        </span>
      }
      actions={
        <form action={rescoreAction}>
          <input type="hidden" name="id" value={d.opp.id} />
          <SubmitButton className="btn-sm btn-ghost" pendingText="…">
            Recalcular
          </SubmitButton>
        </form>
      }
    >
      {reasons ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{reasons.overallNote}</p>
          {DIMENSIONS.map((dim) => (
            <DimensionBlock key={dim.key} label={dim.label} help={dim.help} d={reasons[dim.key]} />
          ))}
          <p className="text-[11px] text-subtle">
            Scoring determinístico {d.score?.version} · {fmtDate(d.score?.createdAt, true)}. No usa atributos personales sensibles. El riesgo se evalúa por separado.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Aún sin evaluar.</p>
      )}
    </Card>
  );
}

export function RiskCard({ d }: { d: Detail }) {
  const active = d.risks.filter((r) => !r.dismissed);
  const dismissed = d.risks.filter((r) => r.dismissed);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert size={15} className={active.length ? "text-warn" : "text-muted"} /> Security Gate
        </span>
      }
    >
      {active.length === 0 ? (
        <p className="text-sm text-muted">Sin alertas detectadas por las reglas estáticas. Esto no garantiza que sea seguro.</p>
      ) : (
        <ul className="space-y-3">
          {active.map((r) => (
            <li key={r.id} className="rounded-md border border-line bg-bg/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.severity === "high" ? "bad" : r.severity === "warning" ? "warn" : "accent"}>{r.severity}</Badge>
                  <span className="text-sm font-medium">{RISK_LABELS[r.type as RiskType]}</span>
                </div>
                <form action={dismissRiskAction}>
                  <input type="hidden" name="flagId" value={r.id} />
                  <input type="hidden" name="dismissed" value="true" />
                  <SubmitButton className="btn-sm btn-ghost text-[11px]">Descartar alerta</SubmitButton>
                </form>
              </div>
              <p className="mt-1.5 font-mono text-[11px] break-words text-subtle">“{r.evidence}”</p>
              <p className="mt-1.5 text-xs text-muted">{RISK_ADVICE[r.type as RiskType]}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex gap-1.5 text-[11px] text-subtle">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        Una alerta no demuestra estafa. Opportunity Hub nunca clona, instala ni ejecuta código de repositorios de terceros, ni abre adjuntos.
      </p>
      {dismissed.length ? (
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">{dismissed.length} alerta(s) descartada(s)</summary>
          <ul className="mt-1 space-y-1">
            {dismissed.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{RISK_LABELS[r.type as RiskType]}</span>
                <form action={dismissRiskAction}>
                  <input type="hidden" name="flagId" value={r.id} />
                  <input type="hidden" name="dismissed" value="false" />
                  <SubmitButton className="btn-sm btn-ghost text-[11px]">Reactivar</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function Row({ label, value, prov }: { label: string; value: React.ReactNode; prov?: { kind: string; note?: string } | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right text-sm">
        <span>{value}</span>
        {prov !== undefined ? <ProvenanceTag kind={prov?.kind} note={prov?.note} /> : null}
      </dd>
    </div>
  );
}

export function DataCard({ d }: { d: Detail }) {
  const o = d.opp;
  const p: FieldProvenance = o.provenance ?? {};
  const unknown = <span className="text-subtle">Unknown</span>;
  return (
    <Card title="Datos y procedencia">
      <dl>
        <Row label="Fuente" value={`${SOURCE_LABEL[o.sourceKey] ?? o.sourceKey} · ${o.ingestionMethod}`} />
        <Row label="Confianza" value={o.confidence} />
        <Row label="Empresa" value={o.companyName ?? unknown} prov={o.companyName ? (p.company ?? { kind: "manual" }) : null} />
        <Row label="Tipo de cliente" value={o.clientType === "unknown" ? unknown : CLIENT_TYPE_LABEL[o.clientType]} prov={o.clientType === "unknown" ? null : p.clientType} />
        <Row label="Modalidad" value={o.engagementType === "unknown" ? unknown : ENGAGEMENT_LABEL[o.engagementType]} prov={o.engagementType === "unknown" ? null : p.engagementType} />
        <Row label="Presupuesto" value={fmtMoney(o.budgetMin, o.budgetMax, o.budgetCurrency, o.budgetPeriod)} prov={o.budgetMin == null && o.budgetMax == null ? null : p.budget} />
        <Row label="Remoto" value={o.remote === null ? unknown : o.remote ? `Sí${o.remoteModality ? ` (${o.remoteModality})` : ""}` : "No"} prov={o.remote === null ? null : (p.remote ?? { kind: "source" })} />
        <Row label="Ubicación" value={o.location ?? unknown} />
        <Row label="Idioma" value={o.language?.toUpperCase() ?? unknown} prov={o.language ? p.language : null} />
        <Row label="Horas/semana" value={o.hoursPerWeek ?? unknown} prov={o.hoursPerWeek ? p.hoursPerWeek : null} />
        <Row label="Duración" value={o.durationText ?? unknown} />
        <Row label="Sector" value={o.sector ?? unknown} prov={o.sector ? (p.sector ?? { kind: "source" }) : null} />
        <Row label="Seniority" value={o.seniority ?? unknown} />
        <Row label="Competidores" value={o.competitorCount ?? unknown} prov={o.competitorCount != null ? p.competitorCount : null} />
        <Row label="Publicada" value={fmtDate(o.publishedAt)} />
        <Row label="Importada" value={fmtDate(o.createdAt, true)} />
      </dl>
      {o.skills.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {o.skills.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </div>
      ) : null}
      {d.company?.description ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted">Descripción de la empresa (fuente)</summary>
          <p className="prose-plain mt-1 text-xs">{d.company.description}</p>
        </details>
      ) : null}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted">Registros de ingestión ({d.records.length})</summary>
        <ul className="mt-1 space-y-1 text-subtle">
          {d.records.map((r) => (
            <li key={r.id}>
              {fmtDate(r.fetchedAt, true)} · {r.sourceKey} · {r.ingestionMethod}
              {r.syncRunId ? ` · sync #${r.syncRunId}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export function EditOpportunityCard({ d }: { d: Detail }) {
  const o = d.opp;
  return (
    <details className="card">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">Corregir datos / notas</summary>
      <form action={updateOpportunityAction} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={o.id} />
        <label className="text-xs text-muted">
          Tipo de cliente
          <select name="clientType" defaultValue={o.clientType} className="input mt-1">
            {Object.entries(CLIENT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Modalidad
          <select name="engagementType" defaultValue={o.engagementType} className="input mt-1">
            {Object.entries(ENGAGEMENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Presupuesto mín.
          <input name="budgetMin" type="number" step="any" min={0} defaultValue={o.budgetMin ?? ""} className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Presupuesto máx.
          <input name="budgetMax" type="number" step="any" min={0} defaultValue={o.budgetMax ?? ""} className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Moneda
          <input name="budgetCurrency" maxLength={3} defaultValue={o.budgetCurrency ?? ""} className="input mt-1 uppercase" />
        </label>
        <label className="text-xs text-muted">
          Periodo
          <select name="budgetPeriod" defaultValue={o.budgetPeriod} className="input mt-1">
            <option value="unknown">Unknown</option>
            <option value="hour">Hora</option>
            <option value="month">Mes</option>
            <option value="year">Año</option>
            <option value="fixed">Fijo</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Idioma
          <select name="language" defaultValue={o.language ?? ""} className="input mt-1">
            <option value="">Unknown</option>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="pt">Portugués</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Remoto
          <select name="remote" defaultValue={o.remote === null ? "unknown" : o.remote ? "yes" : "no"} className="input mt-1">
            <option value="unknown">Unknown</option>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Horas/semana
          <input name="hoursPerWeek" type="number" min={1} max={80} defaultValue={o.hoursPerWeek ?? ""} className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Etiquetas (coma)
          <input name="tags" defaultValue={o.tags.join(", ")} className="input mt-1" />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Notas
          <textarea name="notes" rows={3} defaultValue={o.notes ?? ""} className="input mt-1" />
        </label>
        <p className="text-[11px] text-subtle sm:col-span-2">Los campos que cambies quedan marcados como «Manual» y no se sobrescriben en futuras sincronizaciones.</p>
        <div className="sm:col-span-2">
          <SubmitButton className="btn-primary" pendingText="Guardando…">
            Guardar y recalcular
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

export function ProposalVersions({ d }: { d: Detail }) {
  if (!d.proposals.length) return <p className="text-sm text-muted">Sin propuestas todavía.</p>;
  const [latest, ...older] = d.proposals;
  const originLabel = (o: string) => (o === "ai" ? "IA" : o === "template" ? "Plantilla" : "Manual");
  const statusTone = (s: string) => (s === "approved" ? "ok" : s === "sent_manually" ? "accent" : s === "discarded" ? "bad" : "neutral");
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-line bg-bg/40 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <Badge tone="accent">v{latest.version}</Badge>
          <Badge tone={latest.origin === "ai" ? "accent" : "neutral"}>{originLabel(latest.origin)}</Badge>
          <Badge>{latest.language.toUpperCase()}</Badge>
          <Badge tone={statusTone(latest.status)}>{latest.status}</Badge>
          {latest.proposedRate ? <Badge>{latest.proposedRate} USD/h</Badge> : null}
          <span className="text-subtle">
            {fmtDate(latest.createdAt, true)} {latest.changeNote ? `· ${latest.changeNote}` : ""}
          </span>
        </div>
        <form action={saveProposalVersionAction} className="space-y-2">
          <input type="hidden" name="proposalId" value={latest.id} />
          <textarea name="content" defaultValue={latest.content} rows={14} className="input font-mono text-xs leading-relaxed" aria-label="Contenido de la propuesta" />
          <div className="flex flex-wrap items-center gap-2">
            <input name="proposedRate" type="number" step="any" min={1} defaultValue={latest.proposedRate ?? ""} placeholder="Tarifa" className="input w-28" aria-label="Tarifa" />
            <input name="changeNote" placeholder="Nota del cambio (opcional)" maxLength={200} className="input max-w-xs flex-1" aria-label="Nota del cambio" />
            <SubmitButton pendingText="Guardando…">Guardar como v{latest.version + 1}</SubmitButton>
            <CopyButton text={latest.content} />
          </div>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {(
            [
              ["approved", "Aprobar"],
              ["sent_manually", "La envié yo manualmente"],
              ["discarded", "Descartar"],
            ] as const
          ).map(([s, label]) => (
            <form key={s} action={setProposalStatusAction}>
              <input type="hidden" name="proposalId" value={latest.id} />
              <input type="hidden" name="status" value={s} />
              <SubmitButton className={cn("btn-sm", s === "discarded" && "btn-danger")}>{label}</SubmitButton>
            </form>
          ))}
          <span className="text-[11px] text-subtle">Opportunity Hub nunca envía propuestas. Copia el texto y envíalo tú desde la plataforma.</span>
        </div>
      </div>
      {older.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted">Versiones anteriores ({older.length})</summary>
          <ul className="mt-2 space-y-2">
            {older.map((p) => (
              <li key={p.id} className="rounded-md border border-line p-2">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge>v{p.version}</Badge>
                  <Badge>{originLabel(p.origin)}</Badge>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  <span className="text-subtle">
                    {fmtDate(p.createdAt, true)} {p.changeNote ? `· ${p.changeNote}` : ""}
                  </span>
                  <span className="ml-auto">
                    <CopyButton text={p.content} />
                  </span>
                </div>
                <pre className="max-h-40 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-muted">{p.content}</pre>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function ApplicationCard({ d, experiments }: { d: Detail; experiments: { id: number; name: string; variants: string[] }[] }) {
  const app = d.application;
  if (!app) {
    return (
      <Card title="Aplicación">
        <p className="mb-3 text-sm text-muted">Aún no está en tu pipeline.</p>
        <form action={createApplicationAction} className="flex gap-2">
          <input type="hidden" name="opportunityId" value={d.opp.id} />
          <SubmitButton name="status" value="draft" className="btn-primary">
            Crear aplicación (Draft)
          </SubmitButton>
        </form>
      </Card>
    );
  }
  const transitions = allowedTransitions(app.status as ApplicationStatus);
  const toInput = (v: Date | null) => (v ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  return (
    <Card title={<span className="flex items-center gap-2">Aplicación <Badge tone="accent">{STATUS_LABELS[app.status as ApplicationStatus]}</Badge></span>}>
      <form action={moveApplicationAction} className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="applicationId" value={app.id} />
        <label className="text-xs text-muted">
          Mover a
          <select name="to" className="input mt-1 w-40">
            {transitions.map((t) => (
              <option key={t} value={t}>
                {STATUS_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <input name="note" placeholder="Nota (opcional)" className="input max-w-48 flex-1" aria-label="Nota" />
        <SubmitButton className="btn-primary">Mover</SubmitButton>
      </form>
      <p className="mb-3 text-[11px] text-subtle">«Applied» registra que aplicaste tú en la plataforma original; no envía nada.</p>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Detalles y seguimiento</summary>
        <form action={updateApplicationAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="applicationId" value={app.id} />
          <label className="text-xs text-muted">
            Tarifa propuesta
            <input name="proposedRate" type="number" step="any" min={0} defaultValue={app.proposedRate ?? ""} className="input mt-1" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Moneda
              <input name="rateCurrency" maxLength={3} defaultValue={app.rateCurrency ?? "USD"} className="input mt-1 uppercase" />
            </label>
            <label className="text-xs text-muted">
              Periodo
              <select name="ratePeriod" defaultValue={app.ratePeriod} className="input mt-1">
                <option value="hour">Hora</option>
                <option value="month">Mes</option>
                <option value="fixed">Fijo</option>
                <option value="year">Año</option>
                <option value="unknown">—</option>
              </select>
            </label>
          </div>
          <label className="text-xs text-muted">
            Fecha de aplicación
            <input name="appliedAt" type="datetime-local" defaultValue={toInput(app.appliedAt)} className="input mt-1" />
          </label>
          <label className="text-xs text-muted">
            Próximo seguimiento
            <input name="nextFollowUpAt" type="datetime-local" defaultValue={toInput(app.nextFollowUpAt)} className="input mt-1" />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Próximo paso
            <input name="nextStep" defaultValue={app.nextStep ?? ""} className="input mt-1" />
          </label>
          <label className="text-xs text-muted">
            Idioma de la propuesta
            <select name="language" defaultValue={app.language ?? ""} className="input mt-1">
              <option value="">—</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Experimento
            <select name="experimentId" defaultValue={app.experimentId ?? ""} className="input mt-1">
              <option value="">Ninguno</option>
              {experiments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Variante del experimento
            <input name="experimentVariant" list={`variants-${app.id}`} defaultValue={app.experimentVariant ?? ""} className="input mt-1" />
            <datalist id={`variants-${app.id}`}>
              {experiments.flatMap((e) => e.variants.map((v) => <option key={`${e.id}-${v}`} value={v} />))}
            </datalist>
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Enlaces (uno por línea)
            <textarea name="links" rows={2} defaultValue={app.links.join("\n")} className="input mt-1 font-mono text-xs" />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Notas
            <textarea name="notes" rows={3} defaultValue={app.notes ?? ""} className="input mt-1" />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
          </div>
        </form>
      </details>
      <div className="mt-4 border-t border-line pt-3">
        <form action={addApplicationCommentAction} className="flex gap-2">
          <input type="hidden" name="applicationId" value={app.id} />
          <input name="note" required maxLength={2000} placeholder="Añadir comentario…" className="input flex-1" aria-label="Comentario" />
          <SubmitButton>Añadir</SubmitButton>
        </form>
        <ol className="mt-3 space-y-1.5 text-xs">
          {d.events.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="w-24 shrink-0 text-subtle">{fmtDate(e.createdAt, true)}</span>
              <span>
                {e.kind === "status_change" ? (
                  <>
                    {e.fromStatus ? `${STATUS_LABELS[e.fromStatus as ApplicationStatus]} → ` : ""}
                    <strong>{e.toStatus ? STATUS_LABELS[e.toStatus as ApplicationStatus] : ""}</strong>
                  </>
                ) : null}
                {e.note ? <span className={e.kind === "status_change" ? "text-muted" : ""}> {e.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

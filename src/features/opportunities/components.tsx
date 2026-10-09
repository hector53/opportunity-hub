import Link from "next/link";
import { Bookmark, Eye, FileText, Trash2, X } from "lucide-react";
import { Badge, DemoBadge, RiskBadge, ScorePill } from "@/components/ui";
import { ExternalAction } from "@/components/external-action";
import { SubmitButton } from "@/components/submit-button";
import { CLIENT_TYPE_LABEL, ENGAGEMENT_LABEL, fmtDate, fmtMoney, OPP_STATUS_LABEL, SOURCE_LABEL } from "@/lib/format";
import type { OpportunityFilters } from "./filters";
import type { OpportunityRow } from "./queries";
import { deletePresetAction, savePresetAction, setOpportunityStatusAction } from "./actions";

const GROUPS: { key: keyof OpportunityFilters; label: string; options: [string, string][] }[] = [
  { key: "source", label: "Fuente", options: Object.entries(SOURCE_LABEL).filter(([k]) => k !== "email") },
  { key: "engagement", label: "Modalidad", options: Object.entries(ENGAGEMENT_LABEL) },
  { key: "clientType", label: "Tipo de cliente", options: Object.entries(CLIENT_TYPE_LABEL) },
  { key: "status", label: "Estado", options: Object.entries(OPP_STATUS_LABEL) },
  { key: "language", label: "Idioma", options: [["es", "Español"], ["en", "Inglés"], ["pt", "Portugués"], ["unknown", "Unknown"]] },
  { key: "risk", label: "Riesgo", options: [["none", "Sin alertas"], ["low", "Bajo"], ["medium", "Medio"], ["high", "Alto"]] },
];

function CheckGroup({ name, label, options, selected }: { name: string; label: string; options: [string, string][]; selected: string[] }) {
  return (
    <details className="group relative">
      <summary className="btn btn-sm cursor-pointer list-none">
        {label}
        {selected.length ? <span className="rounded bg-accent-soft px-1 text-accent">{selected.length}</span> : null}
      </summary>
      <div className="absolute z-30 mt-1 w-52 rounded-md border border-line-strong bg-surface-2 p-2 shadow-xl">
        {options.map(([value, text]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface-3">
            <input type="checkbox" name={name} value={value} defaultChecked={selected.includes(value)} className="accent-accent" />
            {text}
          </label>
        ))}
      </div>
    </details>
  );
}

export function FiltersBar({ f }: { f: OpportunityFilters }) {
  return (
    <form method="get" action="/opportunities" className="card mb-3 flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={f.q} placeholder="Buscar título, empresa, texto…" className="input max-w-xs flex-1" aria-label="Buscar" />
        {GROUPS.map((g) => (
          <CheckGroup key={g.key} name={g.key} label={g.label} options={g.options} selected={(f[g.key] as string[]) ?? []} />
        ))}
        <details className="relative">
          <summary className="btn btn-sm cursor-pointer list-none">Más filtros</summary>
          <div className="absolute z-30 mt-1 grid w-72 gap-2 rounded-md border border-line-strong bg-surface-2 p-3 shadow-xl">
            <label className="text-xs text-muted">
              Tarifa mínima (USD/h aprox.)
              <input name="minBudget" type="number" min={0} defaultValue={f.minBudget} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Score mínimo
              <input name="minScore" type="number" min={0} max={100} defaultValue={f.minScore} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Stack (p. ej. react, node)
              <input name="stack" defaultValue={f.stack} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Sector
              <input name="sector" defaultValue={f.sector} placeholder="saas, fintech, ai…" className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              País
              <input name="country" defaultValue={f.country} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Publicadas en los últimos N días
              <input name="maxAgeDays" type="number" min={1} defaultValue={f.maxAgeDays} className="input mt-1" />
            </label>
            <label className="text-xs text-muted">
              Registros Demo
              <select name="demo" defaultValue={f.demo ?? "include"} className="input mt-1">
                <option value="include">Incluir</option>
                <option value="exclude">Excluir</option>
                <option value="only">Sólo Demo</option>
              </select>
            </label>
          </div>
        </details>
        <select name="sort" defaultValue={f.sort ?? "score"} className="input w-auto py-1 text-xs" aria-label="Ordenar">
          <option value="score">Orden: score</option>
          <option value="published">Orden: publicación</option>
          <option value="created">Orden: importación</option>
          <option value="budget">Orden: tarifa</option>
        </select>
        <button className="btn btn-primary btn-sm">Aplicar</button>
        <Link href="/opportunities" className="btn btn-ghost btn-sm">
          Limpiar
        </Link>
      </div>
      <p className="text-[11px] text-subtle">
        La tarifa mínima convierte salarios mensuales/anuales a USD/h (160 h/mes). Presupuestos fijos o en otra moneda quedan fuera del filtro.
      </p>
    </form>
  );
}

export function PresetBar({ f, presets }: { f: OpportunityFilters; presets: { id: number; name: string; query: string }[] }) {
  const hidden = Object.entries(f).flatMap(([k, v]) =>
    v === undefined || k === "page" ? [] : Array.isArray(v) ? v.map((x, i) => <input key={`${k}${i}`} type="hidden" name={k} value={x} />) : [<input key={k} type="hidden" name={k} value={String(v)} />],
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Filtros guardados:</span>
      {presets.length === 0 ? <span className="text-xs text-subtle">ninguno</span> : null}
      {presets.map((p) => (
        <span key={p.id} className="inline-flex items-center rounded-md border border-line-strong bg-surface-2 text-xs">
          <Link href={`/opportunities?${p.query}`} className="px-2 py-1 hover:text-accent">
            {p.name}
          </Link>
          <form action={deletePresetAction}>
            <input type="hidden" name="presetId" value={p.id} />
            <button className="px-1.5 py-1 text-subtle hover:text-bad" aria-label={`Eliminar filtro ${p.name}`}>
              <X size={12} />
            </button>
          </form>
        </span>
      ))}
      <form action={savePresetAction} className="ml-auto flex items-center gap-1">
        {hidden}
        <input name="presetName" required maxLength={80} placeholder="Nombre del filtro" className="input w-40 py-1 text-xs" aria-label="Nombre del filtro" />
        <SubmitButton className="btn-sm">Guardar filtro actual</SubmitButton>
      </form>
    </div>
  );
}

function StatusForm({ id, op, label, icon, className, confirm }: { id: string; op: string; label: string; icon: React.ReactNode; className?: string; confirm?: string }) {
  return (
    <form action={setOpportunityStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton className={`btn-sm btn-ghost ${className ?? ""}`} confirm={confirm}>
        {icon}
        <span className="sr-only">{label}</span>
      </SubmitButton>
    </form>
  );
}

export function RowActions({ row }: { row: OpportunityRow }) {
  return (
    <div className="flex items-center gap-0.5">
      {row.status === "new" ? <StatusForm id={row.id} op="review" label="Review" icon={<Eye size={14} />} /> : null}
      {row.status !== "saved" && row.status !== "applied" ? <StatusForm id={row.id} op="save" label="Save" icon={<Bookmark size={14} />} /> : null}
      <Link href={`/opportunities/${row.id}#proposal`} className="btn btn-sm btn-ghost" title="Generate Proposal">
        <FileText size={14} />
        <span className="sr-only">Generate Proposal</span>
      </Link>
      {row.originalUrl ? <ExternalAction href={row.originalUrl} label="Apply" platform={SOURCE_LABEL[row.sourceKey] ?? row.sourceKey} className="btn-sm btn-ghost" /> : null}
      {row.status !== "discarded" ? <StatusForm id={row.id} op="discard" label="Discard" icon={<Trash2 size={14} />} className="hover:text-bad" /> : null}
    </div>
  );
}

export function OpportunitiesTable({ rows }: { rows: OpportunityRow[] }) {
  return (
    <div className="card relative overflow-x-auto">
      <table className="table-base min-w-[1200px]">
        <thead>
          <tr>
            <th className="w-[26%]">Oportunidad</th>
            <th>Cliente</th>
            <th>Ubicación / idioma</th>
            <th>Presupuesto</th>
            <th>Modalidad</th>
            <th>Publicada</th>
            <th title="Score global ponderado">Total</th>
            <th title="Technology / Job Fit">Tech</th>
            <th title="Client Fit">Client</th>
            <th title="Commercial Fit">Comm.</th>
            <th title="Practical Fit">Pract.</th>
            <th>Riesgo</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/opportunities/${r.id}`} className="font-medium hover:text-accent">
                  {r.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge>{SOURCE_LABEL[r.sourceKey] ?? r.sourceKey}</Badge>
                  {r.isDemo ? <DemoBadge /> : null}
                  {r.possibleDuplicateOfId ? <Badge tone="warn" title="Título y empresa coinciden con otra oportunidad">Posible duplicado</Badge> : null}
                </div>
              </td>
              <td>
                <div className="max-w-40 truncate">{r.companyName ?? <span className="text-subtle">Unknown</span>}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {CLIENT_TYPE_LABEL[r.clientType]}
                  {r.clientType !== "unknown" && r.provenance?.clientType?.kind === "inferred" ? <span className="text-subtle"> (inferido)</span> : null}
                </div>
              </td>
              <td className="text-xs">
                <div className="max-w-36 truncate">{r.location ?? "—"}</div>
                <div className="text-muted">
                  {r.remote === true ? "Remoto" : r.remote === false ? "Presencial" : "Remoto ?"} · {r.language?.toUpperCase() ?? "?"}
                </div>
              </td>
              <td className="text-xs whitespace-nowrap tabular-nums">{fmtMoney(r.budgetMin, r.budgetMax, r.budgetCurrency, r.budgetPeriod)}</td>
              <td className="text-xs">{ENGAGEMENT_LABEL[r.engagementType]}</td>
              <td className="text-xs whitespace-nowrap text-muted">{fmtDate(r.publishedAt ?? r.createdAt)}</td>
              <td>
                <ScorePill value={r.overallScore} label="Total" />
              </td>
              <td>
                <ScorePill value={r.techFit} />
              </td>
              <td>
                <ScorePill value={r.clientFit} />
              </td>
              <td>
                <ScorePill value={r.commercialFit} />
              </td>
              <td>
                <ScorePill value={r.practicalFit} />
              </td>
              <td>
                <RiskBadge level={r.riskLevel} />
              </td>
              <td className="text-xs">{OPP_STATUS_LABEL[r.status]}</td>
              <td>
                <RowActions row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

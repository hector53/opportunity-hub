import Link from "next/link";
import { Columns3, Table2 } from "lucide-react";
import { Badge, DemoBadge, EmptyState, PageHeader, RiskBadge, ScorePill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMoney, relTime, SOURCE_LABEL } from "@/lib/format";
import { listApplications, type ApplicationRow } from "@/features/applications/queries";
import { allowedTransitions, PIPELINE, SIDE_STATES, STATUS_LABELS, type ApplicationStatus } from "@/features/applications/state-machine";
import { moveApplicationAction } from "@/features/applications/actions";

export const metadata = { title: "Applications · Opportunity Hub" };

function MoveForm({ app, compact }: { app: ApplicationRow; compact?: boolean }) {
  const options = allowedTransitions(app.status as ApplicationStatus);
  return (
    <form action={moveApplicationAction} className="flex items-center gap-1">
      <input type="hidden" name="applicationId" value={app.id} />
      <select name="to" className={cn("input py-1 text-xs", compact ? "w-28" : "w-32")} aria-label="Mover a" defaultValue={options.find((o) => PIPELINE.indexOf(o) > PIPELINE.indexOf(app.status as ApplicationStatus)) ?? options[0]}>
        {options.map((t) => (
          <option key={t} value={t}>
            → {STATUS_LABELS[t]}
          </option>
        ))}
      </select>
      <SubmitButton className="btn-sm">Mover</SubmitButton>
    </form>
  );
}

function KanbanCard({ app }: { app: ApplicationRow }) {
  const overdue = app.nextFollowUpAt && app.nextFollowUpAt < new Date();
  return (
    <li className="rounded-md border border-line bg-surface p-2.5 shadow-sm">
      <Link href={`/opportunities/${app.opportunityId}`} className="block text-sm leading-snug font-medium hover:text-accent">
        {app.title}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Badge>{SOURCE_LABEL[app.sourceKey]}</Badge>
        <ScorePill value={app.overallScore} />
        {app.riskLevel !== "none" ? <RiskBadge level={app.riskLevel} /> : null}
        {app.isDemo ? <DemoBadge /> : null}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-muted">
        {app.proposedRate ? <p>Tarifa: {fmtMoney(app.proposedRate, app.proposedRate, app.rateCurrency, app.ratePeriod)}</p> : null}
        {app.appliedAt ? <p>Aplicada {relTime(app.appliedAt)}</p> : null}
        {app.nextFollowUpAt ? <p className={overdue ? "text-bad" : ""}>Seguimiento {relTime(app.nextFollowUpAt)}</p> : null}
        {app.nextStep ? <p className="truncate">→ {app.nextStep}</p> : null}
      </div>
      <div className="mt-2">
        <MoveForm app={app} compact />
      </div>
    </li>
  );
}

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "kanban";
  const statusFilter = (sp.status ?? "").split(",").filter(Boolean);
  const apps = await listApplications(statusFilter);
  const viewHref = (v: string) => `/applications?view=${v}${sp.status ? `&status=${sp.status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Pipeline: Saved → Draft → Applied → Replied → Interview → Offer → Hired. Las transiciones se validan y quedan en el historial."
        actions={
          <div className="flex rounded-md border border-line-strong p-0.5">
            <Link href={viewHref("kanban")} className={cn("btn btn-sm border-0", view === "kanban" ? "bg-surface-3" : "btn-ghost")}>
              <Columns3 size={14} /> Kanban
            </Link>
            <Link href={viewHref("table")} className={cn("btn btn-sm border-0", view === "table" ? "bg-surface-3" : "btn-ghost")}>
              <Table2 size={14} /> Tabla
            </Link>
          </div>
        }
      />
      {statusFilter.length ? (
        <p className="mb-3 text-sm text-muted">
          Filtrado por: {statusFilter.map((s) => STATUS_LABELS[s as ApplicationStatus] ?? s).join(", ")} ·{" "}
          <Link href={`/applications?view=${view}`} className="text-accent hover:underline">
            quitar filtro
          </Link>
        </p>
      ) : null}
      {apps.length === 0 ? (
        <EmptyState
          title="Sin aplicaciones"
          action={
            <Link href="/opportunities" className="btn btn-primary">
              Ir a Opportunities
            </Link>
          }
        >
          Usa «Save» en una oportunidad o «Crear aplicación» en su detalle para añadirla al pipeline.
        </EmptyState>
      ) : view === "kanban" ? (
        <>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {PIPELINE.map((status) => {
              const items = apps.filter((a) => a.status === status);
              return (
                <section key={status} className="w-64 shrink-0 rounded-lg border border-line bg-surface/50" aria-label={STATUS_LABELS[status]}>
                  <header className="flex items-center justify-between border-b border-line px-3 py-2">
                    <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{STATUS_LABELS[status]}</h2>
                    <span className="text-xs text-subtle tabular-nums">{items.length}</span>
                  </header>
                  <ul className="space-y-2 p-2">
                    {items.map((a) => (
                      <KanbanCard key={a.id} app={a} />
                    ))}
                    {items.length === 0 ? <li className="px-1 py-3 text-center text-xs text-subtle">Vacío</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
          {apps.some((a) => SIDE_STATES.includes(a.status as ApplicationStatus)) ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted">Rejected / Withdrawn / Archived ({apps.filter((a) => SIDE_STATES.includes(a.status as ApplicationStatus)).length})</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {apps
                  .filter((a) => SIDE_STATES.includes(a.status as ApplicationStatus))
                  .map((a) => (
                    <div key={a.id} className="space-y-1">
                      <Badge>{STATUS_LABELS[a.status as ApplicationStatus]}</Badge>
                      <ul>
                        <KanbanCard app={a} />
                      </ul>
                    </div>
                  ))}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <div className="card relative overflow-x-auto">
          <table className="table-base min-w-[960px]">
            <thead>
              <tr>
                <th>Oportunidad</th>
                <th>Estado</th>
                <th>Score</th>
                <th>Tarifa propuesta</th>
                <th>Aplicada</th>
                <th>Seguimiento</th>
                <th>Próximo paso</th>
                <th>Mover</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/opportunities/${a.opportunityId}`} className="font-medium hover:text-accent">
                      {a.title}
                    </Link>
                    <div className="mt-1 flex gap-1">
                      <Badge>{SOURCE_LABEL[a.sourceKey]}</Badge>
                      {a.isDemo ? <DemoBadge /> : null}
                      {a.experimentVariant ? <Badge tone="accent">{a.experimentVariant}</Badge> : null}
                    </div>
                  </td>
                  <td>
                    <Badge tone="accent">{STATUS_LABELS[a.status as ApplicationStatus]}</Badge>
                  </td>
                  <td>
                    <ScorePill value={a.overallScore} />
                  </td>
                  <td className="text-xs">{a.proposedRate ? fmtMoney(a.proposedRate, a.proposedRate, a.rateCurrency, a.ratePeriod) : "—"}</td>
                  <td className="text-xs">{fmtDate(a.appliedAt)}</td>
                  <td className={cn("text-xs", a.nextFollowUpAt && a.nextFollowUpAt < new Date() && "text-bad")}>{a.nextFollowUpAt ? relTime(a.nextFollowUpAt) : "—"}</td>
                  <td className="max-w-48 truncate text-xs">{a.nextStep ?? "—"}</td>
                  <td>
                    <MoveForm app={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

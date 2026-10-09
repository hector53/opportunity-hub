import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CLIENT_TYPE_LABEL, ENGAGEMENT_LABEL, fmtDate, SOURCE_LABEL } from "@/lib/format";
import { funnel, MIN_SAMPLE, rateBucket, type FunnelRow } from "@/features/experiments/stats";
import { createExperimentAction, toggleExperimentAction } from "@/features/experiments/actions";

export const metadata = { title: "Experiments · Opportunity Hub" };

function FunnelTable({ rows, label }: { rows: FunnelRow[]; label: string }) {
  if (!rows.length) return <p className="text-sm text-muted">Sin aplicaciones enviadas en este segmento.</p>;
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[560px]">
        <thead>
          <tr>
            <th>{label}</th>
            <th>Enviadas</th>
            <th>Respuestas</th>
            <th>Entrevistas</th>
            <th>Contratos</th>
            <th>Tasa resp.</th>
            <th>Tasa entrev.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {r.key} {r.smallSample ? <Badge tone="warn" title={`Menos de ${MIN_SAMPLE} aplicaciones: no concluyente`}>n pequeña</Badge> : null}
              </td>
              <td className="tabular-nums">{r.sent}</td>
              <td className="tabular-nums">{r.responses}</td>
              <td className="tabular-nums">{r.interviews}</td>
              <td className="tabular-nums">{r.hired}</td>
              <td className="tabular-nums">{pct(r.responseRate)}</td>
              <td className="tabular-nums">{pct(r.interviewRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ExperimentsPage() {
  const a = schema.applications;
  const o = schema.opportunities;
  const [experiments, apps] = await Promise.all([
    db.select().from(schema.experiments).orderBy(desc(schema.experiments.createdAt)),
    db
      .select({
        status: a.status,
        experimentId: a.experimentId,
        variant: a.experimentVariant,
        proposedRate: a.proposedRate,
        ratePeriod: a.ratePeriod,
        appLanguage: a.language,
        isDemo: a.isDemo,
        sourceKey: o.sourceKey,
        language: o.language,
        clientType: o.clientType,
        engagementType: o.engagementType,
        sector: o.sector,
        tags: o.tags,
      })
      .from(a)
      .innerJoin(o, eq(o.id, a.opportunityId)),
  ]);
  const real = apps.filter((x) => !x.isDemo);
  const segments: { label: string; key: (x: (typeof real)[number]) => string }[] = [
    { label: "Fuente", key: (x) => SOURCE_LABEL[x.sourceKey] ?? x.sourceKey },
    { label: "Idioma", key: (x) => (x.appLanguage ?? x.language ?? "unknown").toUpperCase() },
    { label: "Tipo de cliente", key: (x) => CLIENT_TYPE_LABEL[x.clientType] },
    { label: "Modalidad", key: (x) => ENGAGEMENT_LABEL[x.engagementType] },
    { label: "Tarifa propuesta", key: (x) => rateBucket(x.proposedRate, x.ratePeriod) },
    { label: "Sector", key: (x) => x.sector ?? "unknown" },
  ];

  return (
    <>
      <PageHeader title="Experiments" description="Compara estrategias de búsqueda y propuesta. Asigna aplicaciones a una variante desde su tarjeta de Aplicación." />
      <div className="mb-4">
        <Notice tone="warn">
          Las tasas describen tus datos; no prueban causalidad. Con menos de {MIN_SAMPLE} aplicaciones por grupo los resultados no son concluyentes, y la estrategia nunca se ajusta automáticamente. Los registros Demo se excluyen.
        </Notice>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {experiments.length === 0 ? (
            <EmptyState title="Sin experimentos">Crea uno, por ejemplo «Founders vs agencias» con variantes «founder, agency».</EmptyState>
          ) : (
            experiments.map((e) => (
              <Card
                key={e.id}
                title={
                  <span className="flex items-center gap-2">
                    {e.name} <Badge tone={e.active ? "ok" : "neutral"}>{e.active ? "activo" : "cerrado"}</Badge>
                  </span>
                }
                actions={
                  <form action={toggleExperimentAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="active" value={String(!e.active)} />
                    <SubmitButton className="btn-sm btn-ghost">{e.active ? "Cerrar" : "Reabrir"}</SubmitButton>
                  </form>
                }
              >
                {e.hypothesis ? <p className="mb-2 text-sm text-muted">Hipótesis: {e.hypothesis}</p> : null}
                <p className="mb-3 text-xs text-subtle">
                  Variantes: {e.variants.join(" · ")} · desde {fmtDate(e.startedAt)}
                  {e.endedAt ? ` hasta ${fmtDate(e.endedAt)}` : ""}
                </p>
                <FunnelTable
                  label="Variante"
                  rows={funnel(
                    real.filter((x) => x.experimentId === e.id),
                    (x) => x.variant ?? "(sin variante)",
                  )}
                />
              </Card>
            ))
          )}
          <Card title="Segmentos (todas las aplicaciones reales enviadas)">
            <div className="space-y-5">
              {segments.map((s) => (
                <div key={s.label}>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{s.label}</h3>
                  <FunnelTable label={s.label} rows={funnel(real, s.key)} />
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div>
          <Card title="Nuevo experimento">
            <form action={createExperimentAction} className="grid gap-3">
              <label className="text-xs text-muted">
                Nombre
                <input name="name" required minLength={2} maxLength={120} className="input mt-1" placeholder="Propuestas breves vs detalladas" />
              </label>
              <label className="text-xs text-muted">
                Hipótesis
                <textarea name="hypothesis" rows={3} className="input mt-1" placeholder="Las propuestas breves obtienen más respuestas de founders" />
              </label>
              <label className="text-xs text-muted">
                Variantes (coma, 2–6)
                <input name="variants" required className="input mt-1" placeholder="breve, detallada" />
              </label>
              <SubmitButton className="btn-primary">Crear</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

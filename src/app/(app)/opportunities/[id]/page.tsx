import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, Eye, RotateCcw, Trash2 } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { Badge, Card, DemoBadge, Notice, RiskBadge } from "@/components/ui";
import { ExternalAction } from "@/components/external-action";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, OPP_STATUS_LABEL, SOURCE_LABEL } from "@/lib/format";
import { getSettings } from "@/server/services/settings";
import { aiAvailability } from "@/server/ai/openrouter";
import { getOpportunityDetail } from "@/features/opportunities/queries";
import { deleteOpportunityAction, setOpportunityStatusAction } from "@/features/opportunities/actions";
import { ApplicationCard, DataCard, EditOpportunityCard, ProposalVersions, RiskCard, ScoresCard } from "@/features/opportunities/detail-sections";
import { ProposalGenerator } from "@/features/proposals/generator";

export default async function OpportunityDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [d, settings, experiments, sp] = await Promise.all([
    getOpportunityDetail(id),
    getSettings(),
    db.select().from(schema.experiments).where(eq(schema.experiments.active, true)).orderBy(desc(schema.experiments.createdAt)),
    searchParams,
  ]);
  if (!d) notFound();
  const o = d.opp;
  const ai = aiAvailability(settings);
  const platform = SOURCE_LABEL[o.sourceKey] ?? o.sourceKey;

  const statusButton = (op: string, label: string, icon: React.ReactNode, extra?: string) => (
    <form action={setOpportunityStatusAction}>
      <input type="hidden" name="id" value={o.id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton className={extra}>
        {icon} {label}
      </SubmitButton>
    </form>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/opportunities" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft size={12} /> Opportunities
      </Link>
      {sp.imported ? (
        <div className="mb-3">
          <Notice tone={sp.imported === "created" ? "ok" : "accent"}>
            {sp.imported === "created" ? "Oportunidad importada y evaluada." : sp.imported === "updated" ? "Ya existía: se actualizó con los datos nuevos (sin duplicar)." : "Ya existía con los mismos datos: no se creó un duplicado."}
          </Notice>
        </div>
      ) : null}
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{platform}</Badge>
            {o.isDemo ? <DemoBadge /> : null}
            <Badge>{OPP_STATUS_LABEL[o.status]}</Badge>
            <RiskBadge level={o.riskLevel} />
            {o.publishedAt ? <span className="text-xs text-subtle">Publicada {fmtDate(o.publishedAt)}</span> : null}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{o.title}</h1>
          <p className="mt-1 text-sm text-muted">{o.companyName ?? "Cliente desconocido"}</p>
          {o.discardReason ? <p className="mt-1 text-xs text-subtle">Motivo de descarte: {o.discardReason}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {o.status === "new" ? statusButton("review", "Review", <Eye size={14} />) : null}
          {o.status !== "saved" && o.status !== "applied" ? statusButton("save", "Save", <Bookmark size={14} />) : null}
          {o.originalUrl ? <ExternalAction href={o.originalUrl} label="Apply en el sitio original" platform={platform} primary detail="Después de aplicar, registra el cambio a «Applied» en la tarjeta de Aplicación." /> : null}
          {o.status === "discarded" || o.status === "archived" ? (
            statusButton("restore", "Restaurar", <RotateCcw size={14} />)
          ) : (
            <details className="relative">
              <summary className="btn cursor-pointer list-none">
                <Trash2 size={14} /> Discard
              </summary>
              <form action={setOpportunityStatusAction} className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-md border border-line-strong bg-surface-2 p-3 shadow-xl">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="op" value="discard" />
                <input name="reason" placeholder="Motivo (opcional)" maxLength={300} className="input" aria-label="Motivo de descarte" />
                <SubmitButton className="btn-danger w-full">Descartar</SubmitButton>
              </form>
            </details>
          )}
        </div>
      </header>

      {d.duplicate || d.duplicates.length ? (
        <div className="mb-4">
          <Notice tone="warn">
            Posible duplicado entre fuentes (mismo título y empresa):{" "}
            {[d.duplicate, ...d.duplicates].filter(Boolean).map((x) => (
              <Link key={x!.id} href={`/opportunities/${x!.id}`} className="underline">
                {x!.title} ({SOURCE_LABEL[x!.sourceKey] ?? x!.sourceKey})
              </Link>
            ))}
            . No se fusionan automáticamente.
          </Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <Card title="Descripción" actions={<span className="text-[11px] text-subtle">Contenido externo no confiable · sólo texto</span>}>
            {o.description ? (
              <div className="prose-plain max-h-[560px] overflow-auto">{o.description}</div>
            ) : (
              <p className="text-sm text-muted">Sin descripción. Pega el texto de la oferta en «Corregir datos» o reimporta.</p>
            )}
          </Card>
          <section id="proposal" className="scroll-mt-4">
            <Card title="Proposal Copilot">
              <ProposalGenerator
                opportunityId={o.id}
                defaultLanguage={o.language === "en" ? "en" : "es"}
                defaultRate={settings.preferences.targetHourlyRate}
                aiAvailable={ai.available}
                aiReason={ai.available ? undefined : ai.reason}
              />
              <div className="mt-5 border-t border-line pt-4">
                <ProposalVersions d={d} />
              </div>
            </Card>
          </section>
          {d.messages.length ? (
            <Card title="Mensajes vinculados">
              <ul className="space-y-2">
                {d.messages.map((m) => (
                  <li key={m.id} className="rounded-md border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge>{m.classification}</Badge>
                      {m.isPartial ? <Badge tone="warn">Parcial</Badge> : null}
                      {m.isDemo ? <DemoBadge /> : null}
                      {fmtDate(m.receivedAt, true)} · {m.fromName ?? m.fromAddress ?? "—"}
                    </div>
                    <p className="mt-1 font-medium">{m.subject}</p>
                    <p className="prose-plain mt-1 text-xs text-muted">{m.body}</p>
                    {m.originalUrl ? <ExternalAction href={m.originalUrl} label="Ver conversación original" platform={SOURCE_LABEL[m.sourceKey] ?? m.sourceKey} className="btn-sm mt-2" /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <EditOpportunityCard d={d} />
          <form action={deleteOpportunityAction} className="flex justify-end">
            <input type="hidden" name="id" value={o.id} />
            <SubmitButton className="btn-ghost btn-sm text-subtle hover:text-bad" confirm="¿Eliminar definitivamente esta oportunidad, su aplicación y propuestas?">
              <Trash2 size={12} /> Eliminar definitivamente
            </SubmitButton>
          </form>
        </div>
        <div className="min-w-0 space-y-4">
          <ApplicationCard d={d} experiments={experiments} />
          <ScoresCard d={d} />
          <RiskCard d={d} />
          <DataCard d={d} />
        </div>
      </div>
    </div>
  );
}

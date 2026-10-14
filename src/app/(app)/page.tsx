import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, FileText, Inbox, MessageSquareReply, Search, Send, Timer } from "lucide-react";
import { Badge, Card, ConfidenceBadge, DemoBadge, EligibilityBadge, EmptyState, PageHeader, ScorePill, Stat } from "@/components/ui";
import { fmtDate, relTime, SOURCE_LABEL } from "@/lib/format";
import { getDashboard, type Priority } from "@/features/dashboard/queries";
import { getSettings } from "@/server/services/settings";
import { STATUS_LABELS, type ApplicationStatus } from "@/features/applications/state-machine";

export const metadata = { title: "Home · Opportunity Hub" };

const PRIORITY_ICON: Record<Priority["kind"], React.ReactNode> = {
  reply: <MessageSquareReply size={15} className="text-ok" />,
  followup: <CalendarClock size={15} className="text-warn" />,
  interview: <CalendarClock size={15} className="text-ok" />,
  send: <Send size={15} className="text-accent" />,
  draft: <FileText size={15} className="text-accent" />,
  review: <Search size={15} className="text-muted" />,
  stale: <Timer size={15} className="text-warn" />,
};

const STATUS_TONE: Record<string, "ok" | "bad" | "warn" | "neutral"> = { success: "ok", error: "bad", partial: "warn", running: "neutral" };

export default async function HomePage() {
  const [d, settings] = await Promise.all([getDashboard(), getSettings()]);
  const target = settings.preferences.weeklyApplicationTarget;
  const esShare = d.langMix.length ? Math.round(((d.langMix.find((l) => l.lang === "es")?.n ?? 0) / d.langMix.reduce((s, l) => s + l.n, 0)) * 100) : null;

  return (
    <>
      <PageHeader title="Home" description={`Hoy, ${fmtDate(new Date())}. Objetivo semanal: ${target} aplicaciones fuertes.`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Nuevas" value={d.stats.newOpps} hint={`${d.stats.newToday} en 24 h`} href="/opportunities?status=new" />
        <Stat label="Recomendadas" value={d.stats.recommended} hint="score ≥ 70 · confianza media/alta · elegible" href="/opportunities?recommended=1" />
        <Stat label="Enviadas (semana)" value={`${d.stats.sentWeek}/${target}`} hint={esShare === null ? "—" : `${esShare}% ES · meta ${settings.preferences.spanishShare}%`} href="/applications" />
        <Stat label="Esperando respuesta" value={d.stats.awaiting} href="/applications?status=applied" />
        <Stat label="Entrevistas" value={d.stats.interviews} href="/applications?status=interview" />
        <Stat label="Ofertas" value={d.stats.offers} href="/applications?status=offer" />
        <Stat label="Inbox sin leer" value={d.stats.unread} href="/inbox" />
        <Stat label="Seguimientos (7 d)" value={d.followUps.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Card title="Today's Priorities" bodyClassName="p-0">
            {d.priorities.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Nada urgente"
                  action={
                    <Link href="/sources" className="btn btn-primary">
                      Sincronizar fuentes
                    </Link>
                  }
                >
                  Sincroniza Get on Board o importa oportunidades para generar prioridades.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {d.priorities.map((p, i) => (
                  <li key={i}>
                    <Link href={p.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                      {PRIORITY_ICON[p.kind]}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{p.title}</span>
                        <span className="block truncate text-xs text-muted">{p.detail}</span>
                      </span>
                      {p.isDemo ? <DemoBadge /> : null}
                      <ArrowRight size={14} className="text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={d.recommended.length < d.stats.recommended ? `Oportunidades recomendadas (${d.recommended.length} de ${d.stats.recommended})` : `Oportunidades recomendadas (${d.stats.recommended})`}
            actions={
              <Link href="/opportunities?recommended=1" className="text-xs text-accent hover:underline">
                Ver todas
              </Link>
            }
            bodyClassName="p-0"
          >
            {d.recommended.length === 0 ? (
              <p className="p-4 text-sm text-muted">Ninguna cumple los criterios (score ≥ 70 con confianza media/alta, elegible y sin riesgo alto). Revisa las de confianza baja en Opportunities.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.recommended.map((r) => (
                  <li key={r.id}>
                    <Link href={`/opportunities/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                      <ScorePill value={r.overallScore} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{r.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {SOURCE_LABEL[r.sourceKey]} · {r.companyName ?? "Unknown"}
                        </span>
                      </span>
                      <ConfidenceBadge value={r.scoreConfidence} />
                      {r.geoEligibility === "needs_review" ? <EligibilityBadge value={r.geoEligibility} /> : null}
                      {r.isDemo ? <DemoBadge /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Próximos seguimientos" bodyClassName="p-0">
            {d.followUps.length === 0 ? (
              <p className="p-4 text-sm text-muted">Sin seguimientos programados en los próximos 7 días.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.followUps.map((f) => (
                  <li key={f.id}>
                    <Link href={`/opportunities/${f.opportunityId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                      <span className={`w-28 shrink-0 text-xs ${f.nextFollowUpAt && f.nextFollowUpAt < new Date() ? "text-bad" : "text-muted"}`}>{relTime(f.nextFollowUpAt)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{f.title}</span>
                        <span className="block truncate text-xs text-muted">{f.nextStep ?? "—"}</span>
                      </span>
                      <Badge>{STATUS_LABELS[f.status as ApplicationStatus]}</Badge>
                      {f.isDemo ? <DemoBadge /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card
            title="Actividad de fuentes"
            actions={
              <Link href="/sources" className="text-xs text-accent hover:underline">
                Gestionar
              </Link>
            }
          >
            <ul className="space-y-2 text-sm">
              {d.sources.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <span>{s.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {s.lastSyncAt ? relTime(s.lastSyncAt) : null}
                    <Badge tone={s.status === "connected" ? "ok" : s.status === "error" ? "bad" : s.status === "pending_credentials" ? "warn" : "neutral"}>{s.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
            {d.lastRuns.length ? (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
                {d.lastRuns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>
                      {SOURCE_LABEL[r.sourceKey]} · {relTime(r.startedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      +{r.created} <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card title="Actividad reciente" bodyClassName="p-0">
            {d.activity.length === 0 ? (
              <p className="p-4 text-sm text-muted">Sin actividad todavía.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.activity.map((a) => (
                  <li key={a.id} className="flex gap-2 px-4 py-2 text-xs">
                    {a.actor === "system" ? <Inbox size={13} className="mt-0.5 shrink-0 text-subtle" /> : <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-accent" />}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">{a.summary}</span>
                      <span className="text-subtle">{relTime(a.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

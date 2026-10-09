import Link from "next/link";
import { desc, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { Badge, Card, DemoBadge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { ExternalAction } from "@/components/external-action";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/cn";
import { fmtDate, SOURCE_LABEL } from "@/lib/format";
import { RISK_LABELS, type RiskType } from "@/server/security/risk-rules";
import { MessageForm } from "@/features/inbox/message-form";
import { updateMessageAction } from "@/features/inbox/actions";

export const metadata = { title: "Inbox · Opportunity Hub" };

const CLASSES = ["invitation", "client_reply", "interview_request", "rejection", "offer", "new_opportunity", "other", "unclassified"] as const;

export default async function InboxPage() {
  const [messages, flags, linkable] = await Promise.all([
    db.select().from(schema.messages).orderBy(desc(schema.messages.receivedAt)).limit(200),
    db.select().from(schema.riskFlags).where(isNotNull(schema.riskFlags.messageId)),
    db
      .select({ id: schema.opportunities.id, title: schema.opportunities.title })
      .from(schema.opportunities)
      .where(inArray(schema.opportunities.status, ["saved", "applied", "reviewing"]))
      .orderBy(desc(schema.opportunities.updatedAt))
      .limit(200),
  ]);
  const titles = new Map(
    (messages.some((m) => m.opportunityId)
      ? await db
          .select({ id: schema.opportunities.id, title: schema.opportunities.title })
          .from(schema.opportunities)
          .where(inArray(schema.opportunities.id, messages.map((m) => m.opportunityId).filter((x): x is string => !!x)))
      : []
    ).map((o) => [o.id, o.title]),
  );

  return (
    <>
      <PageHeader title="Inbox" description="Notificaciones y respuestas. En M0 se importan pegándolas; en M1 llegarán desde Gmail y Upwork oficial." />
      <div className="mb-4">
        <Notice tone="warn">
          El contenido de los mensajes es no confiable: se analiza como datos, nunca se siguen instrucciones que contenga, y los adjuntos no se descargan. Una notificación no es la conversación completa: usa el enlace original.
        </Notice>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-3">
          {messages.length === 0 ? (
            <EmptyState title="Inbox vacío">Pega aquí notificaciones de Upwork, Workana o email para clasificarlas y vincularlas a tus aplicaciones.</EmptyState>
          ) : (
            messages.map((m) => {
              const mflags = flags.filter((f) => f.messageId === m.id && !f.dismissed);
              return (
                <article key={m.id} className={cn("card p-4", !m.read && "border-accent/40")}>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {!m.read ? <span className="size-2 rounded-full bg-accent" aria-label="No leído" /> : null}
                    <Badge tone="accent">{SOURCE_LABEL[m.sourceKey] ?? m.sourceKey}</Badge>
                    <Badge title={m.classificationInferred ? "Clasificación inferida por reglas" : "Clasificación confirmada por ti"}>
                      {m.classification}
                      {m.classificationInferred ? " ?" : ""}
                    </Badge>
                    {m.isPartial ? <Badge tone="warn" title="No contiene la conversación completa">Parcial</Badge> : null}
                    {m.isDemo ? <DemoBadge /> : null}
                    {mflags.map((f) => (
                      <Badge key={f.id} tone={f.severity === "high" ? "bad" : "warn"} title={f.evidence}>
                        {RISK_LABELS[f.type as RiskType]}
                      </Badge>
                    ))}
                    <span className="ml-auto">{fmtDate(m.receivedAt, true)}</span>
                  </div>
                  <h2 className="mt-2 text-sm font-semibold">{m.subject ?? "(sin asunto)"}</h2>
                  <p className="text-xs text-subtle">{[m.fromName, m.fromAddress].filter(Boolean).join(" · ") || "Remitente desconocido"}</p>
                  <p className="prose-plain mt-2 max-h-48 overflow-auto text-xs">{m.body}</p>
                  {m.opportunityId ? (
                    <p className="mt-2 text-xs">
                      Vinculado a:{" "}
                      <Link href={`/opportunities/${m.opportunityId}`} className="text-accent hover:underline">
                        {titles.get(m.opportunityId) ?? "oportunidad"}
                      </Link>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {m.originalUrl ? <ExternalAction href={m.originalUrl} label="Conversación original" platform={SOURCE_LABEL[m.sourceKey] ?? m.sourceKey} className="btn-sm" /> : null}
                    <form action={updateMessageAction}>
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="op" value={m.read ? "unread" : "read"} />
                      <SubmitButton className="btn-sm">{m.read ? "Marcar no leído" : "Marcar leído"}</SubmitButton>
                    </form>
                    <form action={updateMessageAction} className="flex items-center gap-1">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="op" value="classify" />
                      <select name="classification" defaultValue={m.classification} className="input w-40 py-1 text-xs" aria-label="Clasificación">
                        {CLASSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="btn-sm">Confirmar</SubmitButton>
                    </form>
                    <form action={updateMessageAction} className="flex items-center gap-1">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="op" value="link" />
                      <select name="opportunityId" defaultValue={m.opportunityId ?? ""} className="input w-44 py-1 text-xs" aria-label="Vincular">
                        <option value="">Sin vincular</option>
                        {linkable.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.title.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="btn-sm">Vincular</SubmitButton>
                    </form>
                    <form action={updateMessageAction} className="ml-auto">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="op" value="delete" />
                      <SubmitButton className="btn-sm btn-ghost text-subtle hover:text-bad" confirm="¿Eliminar este mensaje?">
                        Eliminar
                      </SubmitButton>
                    </form>
                  </div>
                </article>
              );
            })
          )}
        </div>
        <div>
          <Card title="Importar notificación">
            <MessageForm opportunities={linkable} />
          </Card>
        </div>
      </div>
    </>
  );
}

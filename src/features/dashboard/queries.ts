import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { SOURCE_LABEL } from "@/lib/format";
import { recommendedWhere } from "@/features/opportunities/queries";

const o = schema.opportunities;
const a = schema.applications;

export interface Priority {
  kind: "reply" | "followup" | "interview" | "send" | "draft" | "review" | "stale";
  title: string;
  detail: string;
  href: string;
  isDemo?: boolean;
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

const ACTIVE_APP = ["saved", "draft", "applied", "replied", "interview", "offer"] as const;

export async function getDashboard() {
  const now = new Date();
  const week = startOfWeek(now);
  const soon = new Date(now.getTime() + 2 * 86400000);
  const staleCutoff = new Date(now.getTime() - 7 * 86400000);
  const cnt = sql<number>`count(*)::int`;

  const [
    [newOpps],
    [recommendedCount],
    [sentWeek],
    [awaiting],
    [interviews],
    [offers],
    [unread],
    langMix,
    recommended,
    followUps,
    unreadImportant,
    approvedNotSent,
    drafts,
    stale,
    sources,
    lastRuns,
    activity,
    [newToday],
  ] = await Promise.all([
    db.select({ n: cnt }).from(o).where(eq(o.status, "new")),
    db.select({ n: cnt }).from(o).where(recommendedWhere()),
    db.select({ n: cnt }).from(a).where(and(gte(a.appliedAt, week), notInArray(a.status, ["saved", "draft"]))),
    db.select({ n: cnt }).from(a).where(eq(a.status, "applied")),
    db.select({ n: cnt }).from(a).where(eq(a.status, "interview")),
    db.select({ n: cnt }).from(a).where(eq(a.status, "offer")),
    db.select({ n: cnt }).from(schema.messages).where(eq(schema.messages.read, false)),
    db
      .select({ lang: sql<string>`coalesce(${a.language}, ${o.language}, 'unknown')`, n: cnt })
      .from(a)
      .innerJoin(o, eq(o.id, a.opportunityId))
      .where(and(gte(a.appliedAt, week), notInArray(a.status, ["saved", "draft"])))
      .groupBy(sql`1`),
    db
      .select({ id: o.id, title: o.title, sourceKey: o.sourceKey, companyName: o.companyName, overallScore: o.overallScore, scoreConfidence: o.scoreConfidence, geoEligibility: o.geoEligibility, riskLevel: o.riskLevel, isDemo: o.isDemo })
      .from(o)
      .where(recommendedWhere())
      .orderBy(desc(o.overallScore), desc(o.createdAt))
      .limit(6),
    db
      .select({ id: a.id, opportunityId: a.opportunityId, title: o.title, status: a.status, nextFollowUpAt: a.nextFollowUpAt, nextStep: a.nextStep, isDemo: a.isDemo })
      .from(a)
      .innerJoin(o, eq(o.id, a.opportunityId))
      .where(and(inArray(a.status, [...ACTIVE_APP]), isNotNull(a.nextFollowUpAt), lte(a.nextFollowUpAt, new Date(now.getTime() + 7 * 86400000))))
      .orderBy(asc(a.nextFollowUpAt))
      .limit(8),
    db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.read, false), inArray(schema.messages.classification, ["client_reply", "interview_request", "offer", "invitation"])))
      .orderBy(desc(schema.messages.receivedAt))
      .limit(4),
    db
      .select({ opportunityId: schema.proposalDrafts.opportunityId, title: o.title, sourceKey: o.sourceKey, isDemo: o.isDemo })
      .from(schema.proposalDrafts)
      .innerJoin(o, eq(o.id, schema.proposalDrafts.opportunityId))
      .leftJoin(a, eq(a.opportunityId, o.id))
      .where(and(eq(schema.proposalDrafts.status, "approved"), sql`(${a.status} is null or ${a.status} in ('saved','draft'))`))
      .limit(3),
    db
      .select({ opportunityId: a.opportunityId, title: o.title, isDemo: a.isDemo })
      .from(a)
      .innerJoin(o, eq(o.id, a.opportunityId))
      .where(eq(a.status, "draft"))
      .orderBy(desc(a.updatedAt))
      .limit(3),
    db
      .select({ opportunityId: a.opportunityId, title: o.title, appliedAt: a.appliedAt, isDemo: a.isDemo })
      .from(a)
      .innerJoin(o, eq(o.id, a.opportunityId))
      .where(and(eq(a.status, "applied"), lte(a.appliedAt, staleCutoff), isNull(a.nextFollowUpAt)))
      .limit(3),
    db.select().from(schema.sources).orderBy(asc(schema.sources.name)),
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(5),
    db.select().from(schema.activityLog).orderBy(desc(schema.activityLog.createdAt)).limit(12),
    db.select({ n: cnt }).from(o).where(gte(o.createdAt, new Date(now.getTime() - 86400000))),
  ]);

  const priorities: Priority[] = [];
  for (const m of unreadImportant)
    priorities.push({
      kind: "reply",
      title: `Responder a cliente de ${SOURCE_LABEL[m.sourceKey] ?? m.sourceKey}`,
      detail: m.subject ?? m.body.slice(0, 80),
      href: "/inbox",
      isDemo: m.isDemo,
    });
  for (const f of followUps.filter((x) => x.nextFollowUpAt && x.nextFollowUpAt <= soon))
    priorities.push({
      kind: f.status === "interview" ? "interview" : "followup",
      title: f.status === "interview" ? "Preparar entrevista" : "Dar seguimiento",
      detail: `${f.title}${f.nextStep ? ` — ${f.nextStep}` : ""}`,
      href: `/opportunities/${f.opportunityId}`,
      isDemo: f.isDemo,
    });
  for (const p of approvedNotSent)
    priorities.push({ kind: "send", title: "Enviar propuesta aprobada (tú, en la plataforma)", detail: p.title, href: `/opportunities/${p.opportunityId}#proposal`, isDemo: p.isDemo });
  for (const d of drafts) priorities.push({ kind: "draft", title: "Terminar y aprobar propuesta", detail: d.title, href: `/opportunities/${d.opportunityId}#proposal`, isDemo: d.isDemo });
  for (const s of stale) priorities.push({ kind: "stale", title: "Dar seguimiento a aplicación sin respuesta (+7 días)", detail: s.title, href: `/opportunities/${s.opportunityId}`, isDemo: s.isDemo });
  for (const r of recommended.slice(0, 3))
    priorities.push({ kind: "review", title: `Revisar oportunidad de ${SOURCE_LABEL[r.sourceKey] ?? r.sourceKey} (score ${r.overallScore})`, detail: r.title, href: `/opportunities/${r.id}`, isDemo: r.isDemo });

  return {
    stats: {
      newOpps: newOpps.n,
      newToday: newToday.n,
      recommended: recommendedCount.n,
      sentWeek: sentWeek.n,
      awaiting: awaiting.n,
      interviews: interviews.n,
      offers: offers.n,
      unread: unread.n,
    },
    langMix,
    priorities: priorities.slice(0, 8),
    recommended,
    followUps,
    sources,
    lastRuns,
    activity,
  };
}

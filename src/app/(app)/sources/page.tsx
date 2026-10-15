import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, relTime, SOURCE_LABEL } from "@/lib/format";
import { SOURCE_DEFINITIONS } from "@/server/connectors/registry";
import { upworkConnector } from "@/server/connectors/upwork/adapter";
import { workanaConnector } from "@/server/connectors/workana/adapter";
import { emailConnector } from "@/server/connectors/email/adapter";
import { getSettings } from "@/server/services/settings";
import { SyncButton } from "@/features/sources/sync-button";
import { toggleSourceAction } from "@/features/sources/actions";
import { UpworkConnect } from "@/features/sources/upwork-connect";
import { UpworkSearchForm } from "@/features/sources/upwork-search";
import { getUpworkConnection } from "@/server/connectors/upwork/token-store";

export const metadata = { title: "Sources · Opportunity Hub" };

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "neutral" | "accent"> = {
  connected: "ok",
  manual: "accent",
  email_based: "accent",
  pending_credentials: "warn",
  error: "bad",
  disabled: "neutral",
};
const RUN_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { success: "ok", partial: "warn", error: "bad", running: "neutral" };
const RUNTIME = { upwork: upworkConnector, workana: workanaConnector, email: emailConnector } as const;

export default async function SourcesPage() {
  const [rows, runs, settings] = await Promise.all([
    db.select().from(schema.sources),
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(30),
    getSettings(),
  ]);
  const upworkConnection = await getUpworkConnection();
  const gob = settings.sync.getonboard;
  const upworkConfigured = Boolean(process.env.UPWORK_MCP_CLIENT_ID && (process.env.UPWORK_MCP_TOKEN_ENCRYPTION_KEY?.length ?? 0) >= 32);
  return (
    <>
      <PageHeader title="Sources" description="Estado de integraciones. Sólo se usan APIs oficiales o importación manual; nunca scraping ni cookies de sesión." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SOURCE_DEFINITIONS.map((def) => {
          const row = rows.find((r) => r.key === def.key);
          const runtime = RUNTIME[def.key as keyof typeof RUNTIME]?.status();
          const upworkStatus = def.key === "upwork" && upworkConnection ? upworkConnection.status === "connected" ? "connected" : "error" : null;
          const status = row?.status === "disabled" ? "disabled" : (upworkStatus ?? runtime?.status ?? row?.status ?? def.defaultStatus);
          return (
            <Card
              key={def.key}
              title={
                <span className="flex items-center gap-2">
                  {def.name} <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                </span>
              }
              actions={
                <form action={toggleSourceAction}>
                  <input type="hidden" name="sourceKey" value={def.key} />
                  <input type="hidden" name="enable" value={row?.status === "disabled" ? "true" : "false"} />
                  <SubmitButton className="btn-sm btn-ghost">{row?.status === "disabled" ? "Habilitar" : "Deshabilitar"}</SubmitButton>
                </form>
              }
            >
              <p className="text-sm text-muted">{def.description}</p>
              {runtime && !upworkStatus ? <p className="mt-2 text-xs text-warn">{runtime.detail}</p> : null}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-subtle">Último sync OK</dt>
                  <dd>{row?.lastSyncAt ? relTime(row.lastSyncAt) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Última ejecución</dt>
                  <dd>{row?.lastRunAt ? relTime(row.lastRunAt) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Importadas</dt>
                  <dd className="tabular-nums">{row?.importedCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Último error</dt>
                  <dd className="break-words text-bad">{row?.lastError ?? "—"}</dd>
                </div>
              </dl>
              {def.key === "getonboard" ? (
                <div className="mt-4 space-y-2 border-t border-line pt-3">
                  <p className="text-xs text-muted">
                    Búsquedas: {gob.queries.join(", ")} · {gob.maxPagesPerQuery} pág./búsqueda · {gob.remoteOnly ? "sólo remotas" : "todas"} · automático{" "}
                    {gob.enabled ? `cada ${gob.intervalMinutes} min` : "desactivado"} (editable en Settings).
                  </p>
                  <SyncButton sourceKey="getonboard" disabled={row?.status === "disabled"} />
                </div>
              ) : null}
              {def.key === "upwork" ? (
                <>
                  <p className="mt-3 text-xs text-muted">Discovery read-only, bajo demanda y con contenido temporal (TTL conservador de 23 h). El scoring y el Security Gate existentes siguen siendo la única evaluación.</p>
                  <UpworkConnect connected={upworkConnection?.status === "connected"} configured={upworkConfigured} />
                  <UpworkSearchForm disabled={upworkConnection?.status !== "connected" || row?.status === "disabled"} defaultQuery={settings.profile.skills.slice(0, 3).map((skill) => skill.name).join(", ")} />
                </>
              ) : null}
              <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[11px] text-subtle">
                {[...def.capabilities, ...def.limitations].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      <Card title="Historial de sincronizaciones" className="mt-4" bodyClassName="p-0 overflow-x-auto">
        {runs.length === 0 ? (
          <p className="p-4 text-sm text-muted">Aún no hay ejecuciones.</p>
        ) : (
          <table className="table-base min-w-[760px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Fuente</th>
                <th>Origen</th>
                <th>Inicio</th>
                <th>Duración</th>
                <th>Estado</th>
                <th>Recibidas</th>
                <th>Nuevas</th>
                <th>Actualizadas</th>
                <th>Omitidas</th>
                <th>Errores</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="text-subtle">{r.id}</td>
                  <td>{SOURCE_LABEL[r.sourceKey]}</td>
                  <td className="text-xs">{r.trigger}</td>
                  <td className="text-xs">{fmtDate(r.startedAt, true)}</td>
                  <td className="text-xs tabular-nums">{r.finishedAt ? `${Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)} s` : "—"}</td>
                  <td>
                    <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="tabular-nums">{r.fetched}</td>
                  <td className="tabular-nums">{r.created}</td>
                  <td className="tabular-nums">{r.updated}</td>
                  <td className="tabular-nums">{r.skipped}</td>
                  <td className="max-w-64 text-xs text-bad">
                    {r.errors.length ? (
                      <details>
                        <summary className="cursor-pointer">{r.errors.length}</summary>
                        <ul className="mt-1 space-y-0.5 break-words">
                          {r.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

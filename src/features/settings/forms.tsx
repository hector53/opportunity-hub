"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import type { AppSettings } from "./types";
import { clearDemoAction, rescoreAllAction, saveSettingsAction, type SettingsState } from "./actions";

function Section({ section, title, description, children }: { section: string; title: string; description?: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="card">
      <header className="border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </header>
      <input type="hidden" name="section" value={section} />
      <div className="grid gap-3 p-4">{children}</div>
      <footer className="flex items-center gap-3 border-t border-line px-4 py-2.5">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <StateNote state={state} />
      </footer>
    </form>
  );
}

function StateNote({ state }: { state: SettingsState }) {
  if (state?.error) return <span className="text-xs text-bad">{state.error}</span>;
  if (state?.ok) return <span className="text-xs text-ok">{state.ok}</span>;
  return null;
}

const L = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`text-xs text-muted ${className ?? ""}`}>
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const LEVELS = ["native", "fluent", "conversational", "basic"];
const CLIENT_TYPES = ["founder", "startup", "smb", "agency", "recruiter", "enterprise"];

export function SettingsForms({ s, aiKeyPresent, aiCallsToday }: { s: AppSettings; aiKeyPresent: boolean; aiCallsToday: number }) {
  const [rescoreState, rescore, rescoring] = useActionState(rescoreAllAction, undefined);
  const [demoState, clearDemo, clearing] = useActionState(clearDemoAction, undefined);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Section section="profile" title="Perfil profesional" description="Fuente única de verdad para scoring y propuestas. Nunca se inventa nada fuera de esto.">
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Nombre">
            <input name="name" defaultValue={s.profile.name} className="input" required />
          </L>
          <L label="Titular">
            <input name="headline" defaultValue={s.profile.headline} className="input" required />
          </L>
          <L label="Años de experiencia">
            <input name="yearsExperience" type="number" min={0} defaultValue={s.profile.yearsExperience} className="input" />
          </L>
          <L label="Ubicación">
            <input name="location" defaultValue={s.profile.location} className="input" />
          </L>
          {(["es", "en"] as const).map((code) => (
            <L key={code} label={`Nivel de ${code === "es" ? "español" : "inglés"}`}>
              <select name={`lang_${code}`} defaultValue={s.profile.languages.find((l) => l.code === code)?.level ?? "basic"} className="input">
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </L>
          ))}
        </div>
        <L label="Skills — una por línea: Nombre | core / secondary / complementary | alias, alias">
          <textarea name="skills" rows={10} className="input font-mono text-xs" defaultValue={s.profile.skills.map((k) => `${k.name} | ${k.level} | ${k.aliases.join(", ")}`).join("\n")} />
        </L>
        <L label="Experiencias verificables — una por línea: clave | Nombre | Resumen | tags, tags">
          <textarea name="experiences" rows={8} className="input font-mono text-xs" defaultValue={s.profile.experiences.map((e) => `${e.key} | ${e.name} | ${e.summary} | ${e.tags.join(", ")}`).join("\n")} />
        </L>
      </Section>

      <div className="grid min-w-0 content-start gap-4">
        <Section section="preferences" title="Criterios comerciales">
          <div className="grid gap-3 sm:grid-cols-3">
            <L label="Tarifa mínima /h">
              <input name="minHourlyRate" type="number" min={0} defaultValue={s.preferences.minHourlyRate} className="input" />
            </L>
            <L label="Tarifa objetivo /h">
              <input name="targetHourlyRate" type="number" min={0} defaultValue={s.preferences.targetHourlyRate} className="input" />
            </L>
            <L label="Moneda">
              <input name="currency" maxLength={3} defaultValue={s.preferences.currency} className="input uppercase" />
            </L>
            <L label="% aplicaciones en español">
              <input name="spanishShare" type="number" min={0} max={100} defaultValue={s.preferences.spanishShare} className="input" />
            </L>
            <L label="Aplicaciones/semana">
              <input name="weeklyApplicationTarget" type="number" min={0} defaultValue={s.preferences.weeklyApplicationTarget} className="input" />
            </L>
            <L label="Horas/semana disponibles">
              <input name="hoursPerWeekAvailable" type="number" min={0} defaultValue={s.preferences.hoursPerWeekAvailable} className="input" />
            </L>
          </div>
          <fieldset>
            <legend className="label">Tipos de cliente preferidos</legend>
            <div className="flex flex-wrap gap-3">
              {CLIENT_TYPES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="preferredClientTypes" value={c} defaultChecked={s.preferences.preferredClientTypes.includes(c)} className="accent-accent" />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          <L label="Modalidades preferidas (en orden de prioridad, coma)">
            <input name="preferredEngagements" defaultValue={s.preferences.preferredEngagements.join(", ")} className="input" />
          </L>
          <L label="Sectores preferidos (coma)">
            <input name="preferredSectors" defaultValue={s.preferences.preferredSectors.join(", ")} className="input" />
          </L>
          <L label="Regiones de clientes (coma)">
            <input name="preferredRegions" defaultValue={s.preferences.preferredRegions.join(", ")} className="input" />
          </L>
        </Section>

        <Section section="scoring" title="Pesos del scoring" description="0–10. Una dimensión con peso 0 se excluye del score global. El riesgo nunca se mezcla con el score.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["w_tech", "Technology", s.scoring.weights.tech],
                ["w_client", "Client", s.scoring.weights.client],
                ["w_commercial", "Commercial", s.scoring.weights.commercial],
                ["w_practical", "Practical", s.scoring.weights.practical],
              ] as const
            ).map(([n, l, v]) => (
              <L key={n} label={l}>
                <input name={n} type="number" min={0} max={10} step="0.5" defaultValue={v} className="input" />
              </L>
            ))}
          </div>
          <L label="Tecnologías que no dominas (penalizan si son principales; coma)">
            <textarea name="unfamiliarTech" rows={2} defaultValue={s.scoring.unfamiliarTech.join(", ")} className="input font-mono text-xs" />
          </L>
        </Section>

        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <form action={rescore}>
              <button className="btn" disabled={rescoring}>
                {rescoring ? "Recalculando…" : "Recalcular todos los scores"}
              </button>
            </form>
            <StateNote state={rescoreState} />
          </div>
        </div>
      </div>

      <Section section="ai" title="Proveedor de IA (OpenRouter, opcional)" description="Server-side. Sin clave, las propuestas usan plantillas etiquetadas; nunca se simula una respuesta de IA.">
        {aiKeyPresent ? (
          <Notice tone="ok">OPENROUTER_API_KEY configurada en el servidor (no se muestra). Llamadas hoy: {aiCallsToday}.</Notice>
        ) : (
          <Notice tone="warn">No hay OPENROUTER_API_KEY en el entorno del servidor. Añádela a .env y reinicia para habilitar IA.</Notice>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={s.ai.enabled} className="accent-accent" /> Habilitar IA
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <L label="Modelo (ID de OpenRouter)" className="sm:col-span-3">
            <input name="model" defaultValue={s.ai.model} className="input font-mono text-xs" />
          </L>
          <L label="Timeout (ms)">
            <input name="timeoutMs" type="number" min={1000} max={120000} defaultValue={s.ai.timeoutMs} className="input" />
          </L>
          <L label="Máx. llamadas/día">
            <input name="maxDailyCalls" type="number" min={0} defaultValue={s.ai.maxDailyCalls} className="input" />
          </L>
        </div>
        <p className="text-[11px] text-subtle">Verifica el ID exacto del modelo y su precio en openrouter.ai/models antes de habilitarla. Las respuestas se cachean 7 días.</p>
      </Section>

      <Section section="sync" title="Sincronización Get on Board">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={s.sync.getonboard.enabled} className="accent-accent" /> Sincronización automática
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <L label="Cada (minutos, ≥ 30)">
            <input name="intervalMinutes" type="number" min={30} defaultValue={s.sync.getonboard.intervalMinutes} className="input" />
          </L>
          <L label="Páginas por búsqueda (1–5)">
            <input name="maxPagesPerQuery" type="number" min={1} max={5} defaultValue={s.sync.getonboard.maxPagesPerQuery} className="input" />
          </L>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="remoteOnly" defaultChecked={s.sync.getonboard.remoteOnly} className="accent-accent" /> Sólo remotas
          </label>
        </div>
        <L label="Búsquedas (una por línea o coma, máx. 20)">
          <textarea name="queries" rows={4} defaultValue={s.sync.getonboard.queries.join("\n")} className="input font-mono text-xs" />
        </L>
      </Section>

      <div className="card">
        <header className="border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">Seguridad (no configurable)</h2>
        </header>
        <ul className="list-disc space-y-1 p-4 pl-8 text-sm text-muted">
          <li>Nunca se envían propuestas, mensajes, aceptaciones ni se gastan Connects sin tu acción explícita en el sitio original.</li>
          <li>Nunca se clona, instala, compila ni ejecuta código de repositorios de terceros.</li>
          <li>Nunca se descargan ni abren adjuntos de email automáticamente.</li>
          <li>Descripciones, emails y contenido importado se tratan como datos, no como instrucciones.</li>
          <li>No se almacenan contraseñas de Upwork, Workana ni Get on Board.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <form action={clearDemo}>
            <button className="btn btn-danger btn-sm" disabled={clearing}>
              {clearing ? "Eliminando…" : "Eliminar todos los datos Demo"}
            </button>
          </form>
          <StateNote state={demoState} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { importOpportunityAction, type FormState } from "./actions";
import { Field, Notice } from "@/components/ui";

function Err({ state, name }: { state: FormState; name: string }) {
  const e = state?.fieldErrors?.[name];
  return e?.length ? <p className="mt-1 text-xs text-bad">{e[0]}</p> : null;
}

export function ImportForm() {
  const [state, action, pending] = useActionState(importOpportunityAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      {state?.error ? <Notice tone="bad">{state.error}</Notice> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Plataforma *" htmlFor="sourceKey">
          <select id="sourceKey" name="sourceKey" className="input" defaultValue="workana">
            <option value="workana">Workana</option>
            <option value="upwork">Upwork</option>
            <option value="getonboard">Get on Board</option>
            <option value="manual">Otra / directa</option>
          </select>
        </Field>
        <Field label="Enlace original" htmlFor="url" className="sm:col-span-2" hint="Sólo se guarda como referencia. Opportunity Hub no descarga ni hace scraping de esa página.">
          <input id="url" name="url" type="url" placeholder="https://…" className="input" />
          <Err state={state} name="url" />
        </Field>
      </div>
      <Field label="Título *" htmlFor="title">
        <input id="title" name="title" required minLength={3} maxLength={300} className="input" />
        <Err state={state} name="title" />
      </Field>
      <Field
        label="Descripción (pega el texto de la oferta)"
        htmlFor="description"
        hint="Se trata como contenido no confiable: se analiza, nunca se ejecutan instrucciones que contenga. Los campos vacíos de abajo se infieren del texto y se marcan como «Inferido»."
      >
        <textarea id="description" name="description" rows={10} className="input font-mono text-xs" />
      </Field>
      <details className="card p-4" open>
        <summary className="cursor-pointer text-sm font-medium">Datos estructurados (opcional, recomendados)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Empresa / cliente" htmlFor="companyName">
            <input id="companyName" name="companyName" className="input" />
          </Field>
          <Field label="Tipo de cliente" htmlFor="clientType">
            <select id="clientType" name="clientType" className="input" defaultValue="">
              <option value="">Inferir / Unknown</option>
              <option value="founder">Founder</option>
              <option value="startup">Startup</option>
              <option value="smb">Pyme</option>
              <option value="agency">Agencia</option>
              <option value="recruiter">Recruiter</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </Field>
          <Field label="Modalidad" htmlFor="engagementType">
            <select id="engagementType" name="engagementType" className="input" defaultValue="">
              <option value="">Inferir / Unknown</option>
              <option value="freelance">Freelance</option>
              <option value="fractional">Fractional</option>
              <option value="contract">Contrato</option>
              <option value="part_time">Part-time</option>
              <option value="full_time">Full-time</option>
            </select>
          </Field>
          <Field label="Presupuesto mín." htmlFor="budgetMin">
            <input id="budgetMin" name="budgetMin" type="number" min={0} step="any" className="input" />
            <Err state={state} name="budgetMin" />
          </Field>
          <Field label="Presupuesto máx." htmlFor="budgetMax">
            <input id="budgetMax" name="budgetMax" type="number" min={0} step="any" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Moneda" htmlFor="budgetCurrency">
              <input id="budgetCurrency" name="budgetCurrency" placeholder="USD" maxLength={3} className="input uppercase" />
            </Field>
            <Field label="Periodo" htmlFor="budgetPeriod">
              <select id="budgetPeriod" name="budgetPeriod" className="input" defaultValue="">
                <option value="">—</option>
                <option value="hour">Hora</option>
                <option value="month">Mes</option>
                <option value="year">Año</option>
                <option value="fixed">Fijo</option>
              </select>
            </Field>
          </div>
          <Field label="Idioma" htmlFor="language">
            <select id="language" name="language" className="input" defaultValue="">
              <option value="">Detectar</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field label="Remoto" htmlFor="remote">
            <select id="remote" name="remote" className="input" defaultValue="">
              <option value="">Detectar</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="País / ubicación" htmlFor="country">
            <input id="country" name="country" className="input" />
          </Field>
          <Field label="Horas/semana" htmlFor="hoursPerWeek">
            <input id="hoursPerWeek" name="hoursPerWeek" type="number" min={1} max={80} className="input" />
          </Field>
          <Field label="Duración" htmlFor="durationText">
            <input id="durationText" name="durationText" placeholder="3 meses, ongoing…" className="input" />
          </Field>
          <Field label="Nº de propuestas/competidores" htmlFor="competitorCount" hint="Si la plataforma lo muestra">
            <input id="competitorCount" name="competitorCount" type="number" min={0} className="input" />
          </Field>
          <Field label="Etiquetas" htmlFor="tags" className="sm:col-span-3" hint="Separadas por coma. Útil para experimentos (p. ej. «founders», «propuesta-breve»).">
            <input id="tags" name="tags" className="input" />
          </Field>
        </div>
      </details>
      <div className="flex justify-end gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Importando…" : "Importar y evaluar"}
        </button>
      </div>
    </form>
  );
}

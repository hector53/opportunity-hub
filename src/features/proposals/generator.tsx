"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Notice } from "@/components/ui";
import { generateProposalAction } from "./actions";

export function ProposalGenerator({
  opportunityId,
  defaultLanguage,
  defaultRate,
  aiAvailable,
  aiReason,
}: {
  opportunityId: string;
  defaultLanguage: "es" | "en";
  defaultRate: number;
  aiAvailable: boolean;
  aiReason?: string;
}) {
  const [state, action, pending] = useActionState(generateProposalAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-muted">
          Idioma
          <select name="language" defaultValue={defaultLanguage} className="input mt-1">
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Estilo
          <select name="style" defaultValue="standard" className="input mt-1">
            <option value="brief">Breve</option>
            <option value="standard">Estándar</option>
            <option value="detailed">Detallada</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Tarifa (USD/h, opcional)
          <input name="rate" type="number" min={1} step="any" defaultValue={defaultRate} className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Motor
          <select name="mode" defaultValue={aiAvailable ? "ai" : "template"} className="input mt-1">
            <option value="ai" disabled={!aiAvailable}>
              IA {aiAvailable ? "" : "(no disponible)"}
            </option>
            <option value="template">Plantilla (sin IA)</option>
          </select>
        </label>
      </div>
      {!aiAvailable ? <p className="text-xs text-subtle">IA no disponible: {aiReason} Las plantillas no simulan IA: son un esqueleto para completar.</p> : null}
      {state?.error ? <Notice tone="bad">{state.error}</Notice> : null}
      {state?.info ? <Notice tone="accent">{state.info}</Notice> : null}
      <button className="btn btn-primary" disabled={pending}>
        <Sparkles size={14} /> {pending ? "Generando…" : "Generate Proposal (nueva versión)"}
      </button>
    </form>
  );
}

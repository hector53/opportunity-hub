"use client";

import { useActionState, useEffect, useRef } from "react";
import { addMessageAction } from "./actions";
import { Notice } from "@/components/ui";

export function MessageForm({ opportunities }: { opportunities: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState(addMessageAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3">
      {state?.error ? <Notice tone="bad">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Origen
          <select name="sourceKey" defaultValue="upwork" className="input mt-1">
            <option value="upwork">Upwork</option>
            <option value="workana">Workana</option>
            <option value="getonboard">Get on Board</option>
            <option value="email">Email</option>
            <option value="manual">Otro</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          De (nombre)
          <input name="fromName" className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Recibido
          <input name="receivedAt" type="datetime-local" className="input mt-1" />
        </label>
      </div>
      <label className="text-xs text-muted">
        Asunto
        <input name="subject" className="input mt-1" />
      </label>
      <label className="text-xs text-muted">
        Contenido (pegado de la notificación)
        <textarea name="body" required rows={5} className="input mt-1 font-mono text-xs" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Enlace a la conversación original
          <input name="originalUrl" type="url" placeholder="https://…" className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Vincular a oportunidad
          <select name="opportunityId" defaultValue="" className="input mt-1">
            <option value="">Sin vincular</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title.slice(0, 80)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isPartial" defaultChecked className="accent-accent" />
        Es una notificación parcial (no contiene la conversación completa)
      </label>
      <div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar mensaje"}
        </button>
      </div>
    </form>
  );
}

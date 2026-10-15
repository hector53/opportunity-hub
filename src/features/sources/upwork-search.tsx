"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { searchUpworkAction } from "./actions";

export function UpworkSearchForm({ disabled, defaultQuery }: { disabled?: boolean; defaultQuery?: string }) {
  const [state, action] = useActionState(searchUpworkAction, undefined);
  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted sm:col-span-2">
          Consulta
          <input name="query" className="input mt-1" placeholder="TypeScript, React, product engineer…" defaultValue={defaultQuery} maxLength={160} disabled={disabled} />
        </label>
        <label className="text-xs text-muted">
          Modo
          <select name="mode" className="input mt-1" defaultValue="search" disabled={disabled}>
            <option value="search">Búsqueda por filtros</option>
            <option value="smart_search">Smart search de Upwork</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Resultados
          <select name="limit" className="input mt-1" defaultValue="10" disabled={disabled}>
            {[5, 10].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Tipo
          <select name="jobType" className="input mt-1" defaultValue="" disabled={disabled}>
            <option value="">Todos</option>
            <option value="hourly">Hourly</option>
            <option value="fixed">Fixed price</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Experiencia
          <input name="experienceLevel" className="input mt-1" placeholder="expert" maxLength={40} disabled={disabled} />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Skills (máximo 5, separadas por coma)
          <input name="skills" className="input mt-1" placeholder="TypeScript, React, PostgreSQL" maxLength={500} disabled={disabled} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="verifiedPaymentOnly" value="true" className="accent-accent" disabled={disabled} /> Sólo clientes con pago verificado
      </label>
      <SubmitButton className="btn-primary" disabled={disabled}>
        <Search size={14} /> Buscar Jobs
      </SubmitButton>
      {disabled ? <p className="text-xs text-subtle">Conecta Upwork para habilitar búsquedas manuales.</p> : null}
      {state?.message ? <p className="text-xs text-ok">{state.message} <Link href="/opportunities?source=upwork&maxAgeDays=1" className="underline">Ver oportunidades recientes</Link></p> : null}
      {state?.error ? <p className="text-xs text-bad">{state.error}</p> : null}
    </form>
  );
}

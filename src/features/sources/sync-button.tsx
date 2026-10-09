"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { syncSourceAction } from "./actions";

export function SyncButton({ sourceKey, disabled }: { sourceKey: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(syncSourceAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="sourceKey" value={sourceKey} />
      <button className="btn btn-primary" disabled={pending || disabled} aria-busy={pending}>
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Sincronizando… (puede tardar ~30 s)" : "Sincronizar ahora"}
      </button>
      {state?.message ? <p className="text-xs text-ok">{state.message}</p> : null}
      {state?.error ? <p className="text-xs text-bad">{state.error}</p> : null}
    </form>
  );
}

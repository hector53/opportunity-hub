"use client";

import { useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/ui";
import { disconnectUpworkAction } from "./actions";

interface PrepareResponse {
  authorizationOrigin: string;
  authorizationUrl: string;
  redirectUri: string;
  registrationMode: "registered" | "cimd";
  tools: string[];
  scope: string | null;
  oauthPermissionNote: string;
}

export function UpworkConnect({ connected, configured, grantedScope }: { connected: boolean; configured: boolean; grantedScope?: string | null }) {
  const [preview, setPreview] = useState<PrepareResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/connectors/upwork/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" });
      const data = (await response.json()) as PrepareResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo preparar OAuth");
      setPreview(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar OAuth");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-line pt-3">
      {!configured ? <Notice tone="warn">Configura un cliente propio (`UPWORK_MCP_CLIENT_REGISTRATION_MODE=registered` + `UPWORK_MCP_CLIENT_ID`, o CIMD) y `UPWORK_MCP_TOKEN_ENCRYPTION_KEY` en `.env`. No se usan credenciales de Codex.</Notice> : null}
      {connected ? (
        <Notice tone="warn">
          <span className="inline-flex items-center gap-1"><ShieldCheck size={14} /> Cuenta conectada.</span>
          <p className="mt-1">Scope OAuth devuelto por Upwork: <code>{grantedScope ?? "Upwork no incluyó un scope en la respuesta"}</code>.</p>
          <p className="mt-1">Este valor es el permiso efectivo reportado por el proveedor y puede incluir escritura; no se interpreta como read-only. Opportunity Hub sólo permite en runtime <code>list_accounts</code> y <code>find_jobs</code>.</p>
        </Notice>
      ) : null}
      {preview ? (
        <div className="space-y-2 rounded-md border border-accent/30 bg-accent-soft/30 p-3 text-xs">
          <p className="font-semibold">Revisa antes de abrir Upwork</p>
          <dl className="grid gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-3">
            <dt className="text-muted">Dominio de autorización</dt>
            <dd className="break-all font-mono">{preview.authorizationOrigin}</dd>
            <dt className="text-muted">Redirect URI exacta</dt>
            <dd className="break-all font-mono">{preview.redirectUri}</dd>
            <dt className="text-muted">Registro del cliente</dt>
            <dd>{preview.registrationMode === "cimd" ? "CIMD (documento HTTPS indicado como client_id)" : "Cliente registrado propio de Opportunity Hub"}</dd>
            <dt className="text-muted">Permisos OAuth solicitados</dt>
            <dd>{preview.scope ?? "No se solicita un scope explícito; el proveedor decide los permisos efectivos."}</dd>
            <dt className="text-muted">Operaciones permitidas por el código</dt>
            <dd>{preview.tools.join(", ")}</dd>
          </dl>
          <p className="text-subtle">{preview.oauthPermissionNote}</p>
          <p className="text-subtle">Upwork puede conceder un conjunto de scopes más amplio que esta solicitud. El valor que devuelva el token se conservará para auditoría y se mostrará después de conectar. Aunque el código sólo expone {preview.tools.join(" y ")}, Opportunity Hub no postula, envía mensajes, gasta Connects, guarda trabajos ni modifica tu perfil.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={preview.authorizationUrl} className="btn btn-primary" rel="noreferrer">
              <ExternalLink size={14} /> Abrir autorización de Upwork
            </a>
            <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={!configured || pending} onClick={prepare}>
          {pending ? "Preparando autorización…" : connected ? "Reautorizar Upwork" : "Connect Upwork"}
        </button>
      )}
      {connected ? (
        <form action={disconnectUpworkAction} className="inline-block">
          <button type="submit" className="btn btn-sm btn-ghost text-bad" onClick={(event) => { if (!window.confirm("¿Desconectar Upwork, borrar los tokens locales y eliminar los resultados temporales importados?")) event.preventDefault(); }}>
            Desconectar y borrar datos temporales
          </button>
        </form>
      ) : null}
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </div>
  );
}

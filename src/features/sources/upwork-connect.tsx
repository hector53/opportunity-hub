"use client";

import { useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/ui";
import { disconnectUpworkAction } from "./actions";

interface PrepareResponse {
  authorizationOrigin: string;
  authorizationUrl: string;
  redirectUri: string;
  tools: string[];
  scope: string | null;
}

export function UpworkConnect({ connected, configured }: { connected: boolean; configured: boolean }) {
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
      {!configured ? <Notice tone="warn">Configura `UPWORK_MCP_CLIENT_ID` y `UPWORK_MCP_TOKEN_ENCRYPTION_KEY` en `.env` antes de conectar. No se usan credenciales de Codex.</Notice> : null}
      {connected ? <Notice tone="ok"><span className="inline-flex items-center gap-1"><ShieldCheck size={14} /> Cuenta conectada para discovery read-only.</span></Notice> : null}
      {preview ? (
        <div className="space-y-2 rounded-md border border-accent/30 bg-accent-soft/30 p-3 text-xs">
          <p className="font-semibold">Revisa antes de abrir Upwork</p>
          <dl className="grid gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-3">
            <dt className="text-muted">Dominio de autorización</dt>
            <dd className="break-all font-mono">{preview.authorizationOrigin}</dd>
            <dt className="text-muted">Redirect URI exacta</dt>
            <dd className="break-all font-mono">{preview.redirectUri}</dd>
            <dt className="text-muted">Herramientas permitidas</dt>
            <dd>{preview.tools.join(", ")}</dd>
            <dt className="text-muted">Scope OAuth</dt>
            <dd>{preview.scope ?? "El proveedor no publicó un scope explícito; la allowlist de herramientas sigue limitada."}</dd>
          </dl>
          <p className="text-subtle">Opportunity Hub no podrá postular, enviar mensajes, gastar Connects, guardar trabajos ni modificar tu perfil.</p>
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

"use client";

import { ExternalLink } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Any navigation to an external platform goes through this confirmation, showing exactly
 * where the user is going. Opportunity Hub itself never submits anything externally.
 */
export function ExternalAction({
  href,
  label,
  platform,
  detail,
  className,
  primary,
}: {
  href: string;
  label: string;
  platform: string;
  detail?: string;
  className?: string;
  primary?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  let host = "";
  try {
    host = new URL(href).host;
  } catch {
    return null;
  }
  return (
    <>
      <button type="button" className={cn("btn", primary && "btn-primary", className)} onClick={() => ref.current?.showModal()}>
        <ExternalLink size={14} /> {label}
      </button>
      <dialog ref={ref} className="m-auto w-[min(92vw,460px)] rounded-lg border border-line-strong bg-surface p-0 text-fg backdrop:bg-black/60">
        <div className="p-5">
          <h3 className="text-base font-semibold">Abrir sitio externo</h3>
          <p className="mt-2 text-sm text-muted">
            Se abrirá <strong className="text-fg">{platform}</strong> en una pestaña nueva. Opportunity Hub <strong className="text-fg">no enviará nada</strong>: cualquier propuesta, mensaje o gasto de Connects lo haces tú en el sitio original.
          </p>
          {detail ? <p className="mt-2 text-sm text-muted">{detail}</p> : null}
          <p className="mt-3 rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs break-all text-muted">
            {host}
            <br />
            {href}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <a className="btn btn-primary" href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={() => ref.current?.close()}>
              Abrir {host}
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}

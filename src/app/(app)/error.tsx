"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-lg font-semibold">Algo falló</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "Error inesperado."}</p>
      {error.digest ? <p className="mt-1 font-mono text-xs text-subtle">ref: {error.digest}</p> : null}
      <button className="btn btn-primary mt-4" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}

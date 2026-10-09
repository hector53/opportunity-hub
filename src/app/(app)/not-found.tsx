import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold">No encontrado</h1>
      <p className="mt-2 text-sm text-muted">El registro no existe o fue eliminado.</p>
      <Link href="/" className="btn mt-4">
        Volver al inicio
      </Link>
    </div>
  );
}

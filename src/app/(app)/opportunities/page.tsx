import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { filtersToSearchParams, parseFilters } from "@/features/opportunities/filters";
import { listOpportunities, listPresets } from "@/features/opportunities/queries";
import { FiltersBar, OpportunitiesTable, PresetBar } from "@/features/opportunities/components";

export const metadata = { title: "Opportunities · Opportunity Hub" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const [{ rows, total, page, pageCount }, presets] = await Promise.all([listOpportunities(f), listPresets()]);
  const qs = (p: number) => {
    const sp = filtersToSearchParams(f);
    sp.set("page", String(p));
    return `/opportunities?${sp.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Opportunities"
        description={`${total} resultado${total === 1 ? "" : "s"}. Por defecto se ocultan descartadas y archivadas.`}
        actions={
          <Link href="/opportunities/new" className="btn btn-primary">
            <Plus size={14} /> Importar
          </Link>
        }
      />
      <FiltersBar f={f} />
      <PresetBar f={f} presets={presets.map((p) => ({ id: p.id, name: p.name, query: filtersToSearchParams(p.filters).toString() }))} />
      {rows.length === 0 ? (
        <EmptyState
          title="No hay oportunidades con estos filtros"
          action={
            <div className="flex gap-2">
              <Link href="/opportunities" className="btn">
                Limpiar filtros
              </Link>
              <Link href="/sources" className="btn btn-primary">
                Sincronizar fuentes
              </Link>
            </div>
          }
        >
          Ajusta los filtros, sincroniza Get on Board o importa una oportunidad manualmente.
        </EmptyState>
      ) : (
        <>
          <OpportunitiesTable rows={rows} />
          {pageCount > 1 ? (
            <nav className="mt-3 flex items-center justify-between text-sm text-muted" aria-label="Paginación">
              <span>
                Página {page} de {pageCount}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link className="btn btn-sm" href={qs(page - 1)}>
                    Anterior
                  </Link>
                ) : null}
                {page < pageCount ? (
                  <Link className="btn btn-sm" href={qs(page + 1)}>
                    Siguiente
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

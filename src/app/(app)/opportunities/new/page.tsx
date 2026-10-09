import { PageHeader } from "@/components/ui";
import { ImportForm } from "@/features/opportunities/import-form";

export const metadata = { title: "Importar · Opportunity Hub" };

export default function NewOpportunityPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Importar oportunidad"
        description="Registra manualmente una oportunidad de Workana, Upwork u otra fuente. Si ya existe (mismo enlace o mismo ID), se actualiza en lugar de duplicarse."
      />
      <ImportForm />
    </div>
  );
}

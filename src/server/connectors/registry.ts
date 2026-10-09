import { db, schema } from "@/server/db/client";

export type SourceStatus = "connected" | "manual" | "email_based" | "pending_credentials" | "error" | "disabled";

export interface SourceDefinition {
  key: string;
  name: string;
  defaultStatus: SourceStatus;
  homepageUrl: string;
  description: string;
  capabilities: string[];
  limitations: string[];
}

/** Static description of every source. Runtime status lives in the `sources` table. */
export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    key: "getonboard",
    name: "Get on Board",
    defaultStatus: "connected",
    homepageUrl: "https://www.getonbrd.com",
    description: "API pública oficial v0 (sin autenticación). Sincronización automática de vacantes públicas.",
    capabilities: ["Búsqueda por texto", "Empresa, tags, modalidad y seniority", "Salario cuando la empresa lo publica"],
    limitations: [
      "Sólo vacantes públicas activas; postular siempre en el sitio original.",
      "La documentación no publica límites de tasa: se usan peticiones secuenciales con pausa.",
    ],
  },
  {
    key: "upwork",
    name: "Upwork",
    defaultStatus: "pending_credentials",
    homepageUrl: "https://www.upwork.com",
    description:
      "Adapter preparado para la API oficial (OAuth 2.0 + GraphQL). Requiere una API key aprobada por Upwork. Mientras tanto: importación manual y (M1) notificaciones por email.",
    capabilities: ["Importación manual de texto/enlace", "Abrir la oportunidad original"],
    limitations: [
      "Sin credenciales aprobadas no hay sincronización.",
      "Nunca scraping autenticado ni uso de cookies de sesión.",
      "Un MCP conectado a otra app (p. ej. tu cliente de IA) no es utilizable desde este backend.",
    ],
  },
  {
    key: "workana",
    name: "Workana",
    defaultStatus: "manual",
    homepageUrl: "https://www.workana.com",
    description: "Sin API oficial conocida. Importación manual y (M1) detección por notificaciones de email.",
    capabilities: ["Importación manual de texto/enlace", "Registro manual de aplicaciones"],
    limitations: ["Sin scrapers, crawlers ni automatización de navegador."],
  },
  {
    key: "email",
    name: "Email (Gmail)",
    defaultStatus: "disabled",
    homepageUrl: "https://mail.google.com",
    description: "M1: Gmail API con OAuth y scope de sólo lectura. Hoy: pegar notificaciones manualmente en Inbox.",
    capabilities: ["Importación manual de mensajes en Inbox"],
    limitations: ["Los adjuntos nunca se descargan ni abren automáticamente.", "Un email no contiene necesariamente toda la conversación."],
  },
  {
    key: "manual",
    name: "Manual / otras",
    defaultStatus: "manual",
    homepageUrl: "",
    description: "Oportunidades registradas a mano (LinkedIn, referidos, contactos directos, etc.).",
    capabilities: ["Formulario completo", "Pegar texto libre"],
    limitations: [],
  },
];

export function sourceDefinition(key: string): SourceDefinition | undefined {
  return SOURCE_DEFINITIONS.find((s) => s.key === key);
}

/** Inserts missing source rows; never overwrites runtime state of existing ones. */
export async function ensureSources() {
  await db
    .insert(schema.sources)
    .values(
      SOURCE_DEFINITIONS.map((s) => ({
        key: s.key,
        name: s.name,
        status: s.defaultStatus,
        description: s.description,
        homepageUrl: s.homepageUrl || null,
      })),
    )
    .onConflictDoNothing();
}

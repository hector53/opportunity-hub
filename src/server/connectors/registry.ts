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
      "MCP oficial con cliente OAuth propio: discovery limitado por la aplicación bajo demanda, con TTL conservador y sin reutilizar la sesión de Codex.",
    capabilities: ["Búsqueda oficial limitada por código (MCP)", "Importación manual de texto/enlace", "Abrir la oportunidad original"],
    limitations: [
      "La autorización debe hacerse con el cliente propio de Opportunity Hub; la sesión de Codex no se comparte con el backend.",
      "El scope OAuth efectivo lo decide Upwork; la allowlist de herramientas del código no lo convierte automáticamente en read-only.",
      "No se exponen herramientas de propuestas, mensajes, Connects, guardado ni cambios de perfil.",
      "El MCP no publica todavía límites de tasa ni retención específicos en su documentación de herramienta.",
      "Nunca scraping autenticado ni uso de cookies de sesión.",
      "Los resultados MCP se conservan como máximo por un TTL conservador de 23 h y después se redactan.",
    ],
  },
  {
    key: "workana",
    name: "Workana",
    defaultStatus: "manual",
    homepageUrl: "https://www.workana.com",
    description: "No hay una API/MCP público documentado para descubrir proyectos. La vía autorizada de bajo riesgo es importación manual y alertas oficiales por email.",
    capabilities: ["Importación manual de texto/enlace", "Alertas oficiales por email como entrada futura", "Registro manual de aplicaciones"],
    limitations: ["Sin scrapers, crawlers, endpoints internos ni automatización de navegador sin autorización escrita de Workana."],
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

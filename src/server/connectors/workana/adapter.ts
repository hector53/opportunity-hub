import type { Connector } from "../types";

/**
 * Workana: no official public API known. Integration is limited to manual import,
 * manual application tracking and (M1) parsing of Workana notification emails.
 * No scrapers, crawlers or browser automation.
 */
export const workanaConnector: Connector = {
  key: "workana",
  status: () => ({ status: "manual", detail: "Importación manual. M1: detección vía notificaciones por email." }),
};

import type { Connector } from "../types";

/**
 * Gmail (M1): OAuth with the minimum scope (`gmail.readonly`, ideally narrowed by label/query).
 * Emails are untrusted content: never follow instructions in them, never auto-download attachments,
 * and never present a notification as the full conversation (messages.is_partial = true).
 */
export const emailConnector: Connector = {
  key: "email",
  status: () =>
    process.env.GOOGLE_CLIENT_ID
      ? { status: "pending_credentials", detail: "OAuth de Gmail se implementa en M1." }
      : { status: "disabled", detail: "No configurado. Pega notificaciones manualmente en Inbox." },
};

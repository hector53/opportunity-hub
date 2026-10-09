export type MessageClass = "invitation" | "client_reply" | "interview_request" | "rejection" | "offer" | "new_opportunity" | "other" | "unclassified";

const RULES: [RegExp, MessageClass][] = [
  [/\b(offer letter|job offer|we('d| would) like to (offer|hire)|oferta (formal|laboral)|te queremos contratar|contract offer|has (been )?hired|you('ve| have) been hired)(?![a-záéíóúñ])/i, "offer"],
  [/\b(interview|schedule a (call|meeting)|book a time|calendly|entrevista|agendar (una )?(llamada|reuni[oó]n)|videollamada)(?![a-záéíóúñ])/i, "interview_request"],
  [/\b(unfortunately|not (moving|move) forward|decided to (go|move) (with|forward with) (another|other)|position (has been )?filled|lamentablemente|no continuaremos|hemos decidido (seguir|continuar) con otr)/i, "rejection"],
  [/\b(invited you|invitation to (interview|submit|apply)|te invit[oó]|invitaci[oó]n (a|para) (postular|enviar))(?![a-záéíóúñ])/i, "invitation"],
  [/\b(new (job|jobs|projects?) (matching|for you)|job alert|recommended jobs|nuevos proyectos|alerta de empleo|proyectos (que|para ti))(?![a-záéíóúñ])/i, "new_opportunity"],
  [/\b(replied|sent you a (new )?message|new message from|respondi[oó]|te envi[oó] un mensaje|nuevo mensaje de)(?![a-záéíóúñ])/i, "client_reply"],
];

/** Rule-based classification of untrusted notification text. Always stored as an inference. */
export function classifyMessage(subject: string, body: string): MessageClass {
  const text = `${subject}\n${body}`;
  for (const [re, cls] of RULES) if (re.test(text)) return cls;
  return "unclassified";
}

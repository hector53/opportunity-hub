import { STATUSES_COUNTED_AS_INTERVIEW, STATUSES_COUNTED_AS_RESPONSE, STATUSES_COUNTED_AS_SENT } from "@/features/applications/state-machine";

export interface FunnelRow {
  key: string;
  sent: number;
  responses: number;
  interviews: number;
  hired: number;
  responseRate: number | null;
  interviewRate: number | null;
  hireRate: number | null;
  smallSample: boolean;
}

export const MIN_SAMPLE = 10;

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export interface ApplicationHistory {
  /** Current status. */
  status: string;
  /** Every status the application ever reached (from application_events.to_status). */
  reached?: string[];
  appliedAt?: Date | null;
}

export interface Milestones {
  sent: boolean;
  responded: boolean;
  interviewed: boolean;
  hired: boolean;
}

const hits = (set: readonly string[], states: Set<string>) => set.some((s) => states.has(s));

/**
 * Conversions are milestones, not current state: an application that reached Interview and was
 * later Rejected still counts as sent, responded and interviewed. Falls back to the current status
 * (and applied date) when there's no recorded history.
 */
export function milestones(a: ApplicationHistory): Milestones {
  const states = new Set([a.status, ...(a.reached ?? [])]);
  return {
    sent: Boolean(a.appliedAt) || hits(STATUSES_COUNTED_AS_SENT, states),
    responded: hits(STATUSES_COUNTED_AS_RESPONSE, states),
    interviewed: hits(STATUSES_COUNTED_AS_INTERVIEW, states),
    hired: states.has("hired"),
  };
}

/** Funnel per group. Only applications that were actually sent count as denominator. */
export function funnel<T extends ApplicationHistory>(items: T[], keyOf: (x: T) => string): FunnelRow[] {
  const groups = new Map<string, Milestones[]>();
  for (const it of items) {
    const m = milestones(it);
    if (!m.sent) continue;
    const k = keyOf(it);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sent = list.length;
      const responses = list.filter((m) => m.responded).length;
      const interviews = list.filter((m) => m.interviewed).length;
      const hired = list.filter((m) => m.hired).length;
      return {
        key,
        sent,
        responses,
        interviews,
        hired,
        responseRate: rate(responses, sent),
        interviewRate: rate(interviews, sent),
        hireRate: rate(hired, sent),
        smallSample: sent < MIN_SAMPLE,
      };
    })
    .sort((a, b) => b.sent - a.sent);
}

export function rateBucket(rate: number | null, period: string): string {
  if (rate == null || period !== "hour") return "sin tarifa/h";
  if (rate < 30) return "< $30/h";
  if (rate < 40) return "$30–39/h";
  if (rate < 50) return "$40–49/h";
  return "≥ $50/h";
}

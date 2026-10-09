import { STATUSES_COUNTED_AS_INTERVIEW, STATUSES_COUNTED_AS_RESPONSE, STATUSES_COUNTED_AS_SENT, type ApplicationStatus } from "@/features/applications/state-machine";

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

/** Funnel per group. Only applications actually sent count as denominator. */
export function funnel<T extends { status: string }>(items: T[], keyOf: (x: T) => string): FunnelRow[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    if (!STATUSES_COUNTED_AS_SENT.includes(it.status as ApplicationStatus)) continue;
    const k = keyOf(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sent = list.length;
      const responses = list.filter((x) => STATUSES_COUNTED_AS_RESPONSE.includes(x.status as ApplicationStatus)).length;
      const interviews = list.filter((x) => STATUSES_COUNTED_AS_INTERVIEW.includes(x.status as ApplicationStatus)).length;
      const hired = list.filter((x) => x.status === "hired").length;
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

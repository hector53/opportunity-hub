export const APPLICATION_STATUSES = [
  "saved",
  "draft",
  "applied",
  "replied",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Main pipeline columns (Kanban). Terminal side-states are shown separately. */
export const PIPELINE: ApplicationStatus[] = ["saved", "draft", "applied", "replied", "interview", "offer", "hired"];
export const SIDE_STATES: ApplicationStatus[] = ["rejected", "withdrawn", "archived"];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  draft: "Draft",
  applied: "Applied",
  replied: "Replied",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

/**
 * Valid transitions. Forward moves can skip steps when reality does (e.g. a client
 * replies with an interview invitation directly). Backward moves are allowed one step
 * to correct mistakes. Any non-archived state can be archived; archived can be restored to saved.
 */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  saved: ["draft", "applied", "withdrawn", "archived"],
  draft: ["saved", "applied", "withdrawn", "archived"],
  applied: ["draft", "replied", "interview", "offer", "rejected", "withdrawn", "archived"],
  replied: ["applied", "interview", "offer", "rejected", "withdrawn", "archived"],
  interview: ["replied", "offer", "rejected", "withdrawn", "archived"],
  offer: ["interview", "hired", "rejected", "withdrawn", "archived"],
  hired: ["offer", "archived"],
  rejected: ["applied", "archived"],
  withdrawn: ["saved", "archived"],
  archived: ["saved"],
};

export function allowedTransitions(from: ApplicationStatus): ApplicationStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Moving to "applied" is a record of something the user did manually on the original site. */
export const STATUSES_COUNTED_AS_SENT: ApplicationStatus[] = ["applied", "replied", "interview", "offer", "hired", "rejected"];
export const STATUSES_COUNTED_AS_RESPONSE: ApplicationStatus[] = ["replied", "interview", "offer", "hired", "rejected"];
export const STATUSES_COUNTED_AS_INTERVIEW: ApplicationStatus[] = ["interview", "offer", "hired"];

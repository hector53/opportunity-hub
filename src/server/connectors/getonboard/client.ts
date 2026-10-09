import { gobSearchResponseSchema } from "./mapper";

export const GOB_BASE_URL = "https://www.getonbrd.com/api/v0";
const USER_AGENT = "OpportunityHub/0.1 (private personal job tracker; low-frequency polling)";

export interface GobSearchPage {
  items: unknown[];
  page: number;
  totalPages: number;
}

export class GobHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Public, unauthenticated Get on Board search. Only reads public job data.
 * Requests are sequential with a delay to stay well below any reasonable rate limit
 * (the published docs don't state one).
 */
export async function searchJobs(
  query: string,
  page: number,
  opts: { perPage?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<GobSearchPage> {
  const url = new URL(`${GOB_BASE_URL}/search/jobs`);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(opts.perPage ?? 50));
  url.searchParams.set("page", String(page));
  url.searchParams.set("expand", JSON.stringify(["company", "tags", "modality", "seniority"]));

  const res = await (opts.fetchImpl ?? fetch)(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    cache: "no-store",
  });
  if (!res.ok) throw new GobHttpError(`Get on Board respondió HTTP ${res.status} para "${query}" (página ${page})`, res.status);
  const json = gobSearchResponseSchema.parse(await res.json());
  return { items: json.data, page: json.meta?.page ?? page, totalPages: json.meta?.total_pages ?? page };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

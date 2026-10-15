import { UPWORK_MCP_PROTOCOL_VERSION, UPWORK_MCP_SERVER_URL } from "./config";
import { assertAllowedUpworkMcpDiscoveryTool, type UpworkMcpDiscoveryTool } from "./mcp-policy";

const MCP_TIMEOUT_MS = 20_000;
const MCP_RETRY_DELAY_MS = 750;
const USER_AGENT = "OpportunityHub/0.1 (private read-only discovery)";

export class UpworkMcpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string | number,
  ) {
    super(message);
    this.name = "UpworkMcpError";
  }
}

/** Never copy provider/tool error text into the private UI or sync history. */
export function safeUpworkMcpErrorMessage(error: unknown): string {
  if (error instanceof UpworkMcpError) {
    return error.status ? `Upwork MCP respondió HTTP ${error.status}` : "Upwork MCP rechazó la operación";
  }
  return "No se pudo completar la búsqueda de Upwork";
}

type JsonRpcResponse = { result?: unknown; error?: { code?: string | number; message?: string } };

function parseSse(text: string): unknown {
  const events = text
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n"))
    .filter(Boolean);
  const last = events.at(-1);
  if (!last) throw new UpworkMcpError("Upwork MCP devolvió un SSE vacío");
  try {
    return JSON.parse(last);
  } catch {
    throw new UpworkMcpError("Upwork MCP devolvió un evento inválido");
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) return parseSse(text);
  try {
    return JSON.parse(text);
  } catch {
    throw new UpworkMcpError("Upwork MCP devolvió JSON inválido");
  }
}

export function unwrapMcpToolResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.structuredContent !== undefined) return record.structuredContent;
  if (Array.isArray(record.content)) {
    const textValues = record.content
      .filter((item): item is { type?: unknown; text?: unknown } => Boolean(item && typeof item === "object"))
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text as string);
    for (const text of textValues) {
      try {
        return JSON.parse(text);
      } catch {
        // A text-only result remains data; it is not executed or interpreted as instructions.
      }
    }
    return textValues.join("\n");
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arraysAt(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const object = record(value);
  for (const key of keys) if (Array.isArray(object[key])) return object[key] as unknown[];
  return [];
}

export interface UpworkAccountRef {
  orgUid: string;
  label: string | null;
}

export function parseUpworkAccounts(value: unknown): UpworkAccountRef[] {
  const candidates = arraysAt(value, ["accounts", "organizations", "orgs", "data", "results"]);
  const found = candidates
    .map((item) => record(item))
    .map((item) => {
      const orgUid = [item.org_uid, item.orgUid, item.uid, item.id].find((v): v is string | number => typeof v === "string" || typeof v === "number");
      if (orgUid == null) return null;
      const label = [item.name, item.display_name, item.title, item.email].find((v): v is string => typeof v === "string" && v.trim().length > 0) ?? null;
      return { orgUid: String(orgUid), label };
    })
    .filter((item): item is UpworkAccountRef => item !== null);
  return [...new Map(found.map((item) => [item.orgUid, item])).values()];
}

export interface UpworkMcpJobPage {
  jobs: unknown[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function parseUpworkJobPage(value: unknown): UpworkMcpJobPage {
  const object = record(value);
  const jobs = arraysAt(value, ["jobs", "results", "data", "items"]);
  const pageInfo = record(object.pageInfo);
  const cursor = [object.next_cursor, object.nextCursor, pageInfo.endCursor, pageInfo.nextCursor].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  const hasMore = typeof object.hasNextPage === "boolean" ? object.hasNextPage : typeof pageInfo.hasNextPage === "boolean" ? pageInfo.hasNextPage : cursor !== null;
  return { jobs, nextCursor: cursor, hasMore };
}

export interface UpworkFindJobsArgs {
  org_uid: string;
  action: "search" | "smart_search";
  query?: string;
  title?: string;
  limit: number;
  cursor?: string;
  sort?: string;
  job_type?: "fixed" | "hourly";
  experience_level?: string;
  skills?: string[];
  verified_payment_only?: boolean;
}

export class UpworkMcpClient {
  private sessionId: string | null = null;
  private initialized = false;
  private nextId = 1;

  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoint = UPWORK_MCP_SERVER_URL,
  ) {}

  private async request(method: string, params: Record<string, unknown> = {}, notification = false): Promise<unknown> {
    const id = notification ? undefined : this.nextId++;
    const body = notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params };
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": UPWORK_MCP_PROTOCOL_VERSION,
      "User-Agent": USER_AGENT,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      response = await this.fetchImpl(this.endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(MCP_TIMEOUT_MS), cache: "no-store" });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= 1) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 2_000) : MCP_RETRY_DELAY_MS;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) this.sessionId = sessionId;
    if (!response.ok) throw new UpworkMcpError(`Upwork MCP respondió HTTP ${response.status}`, response.status);
    if (notification && (response.status === 202 || response.status === 204)) return null;
    const parsed = (await readJson(response)) as JsonRpcResponse | null;
    if (!parsed || typeof parsed !== "object") throw new UpworkMcpError("Respuesta MCP vacía");
    if (parsed.error) throw new UpworkMcpError(parsed.error.message ?? "Upwork MCP rechazó la operación", undefined, parsed.error.code);
    return parsed.result;
  }

  private async initialize() {
    if (this.initialized) return;
    await this.request("initialize", {
      protocolVersion: UPWORK_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "opportunity-hub", version: "0.1.0" },
    });
    await this.request("notifications/initialized", {}, true);
    this.initialized = true;
  }

  async callDiscoveryTool(name: UpworkMcpDiscoveryTool, args: Record<string, unknown>): Promise<unknown> {
    assertAllowedUpworkMcpDiscoveryTool(name);
    await this.initialize();
    const result = await this.request("tools/call", { name, arguments: args });
    return unwrapMcpToolResult(result);
  }

  listAccounts() {
    return this.callDiscoveryTool("list_accounts", {});
  }

  async findJobs(args: UpworkFindJobsArgs): Promise<UpworkMcpJobPage> {
    const result = await this.callDiscoveryTool("find_jobs", args as unknown as Record<string, unknown>);
    return parseUpworkJobPage(result);
  }
}

export async function withUpworkMcp<T>(operation: (client: UpworkMcpClient) => Promise<T>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const { getUpworkAccessToken, markUpworkError, markUpworkUsed } = await import("./token-store");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { token } = await getUpworkAccessToken({ forceRefresh: attempt === 1 });
      const result = await operation(new UpworkMcpClient(token, fetchImpl));
      await markUpworkUsed();
      return result;
    } catch (error) {
      lastError = error;
      if (!(error instanceof UpworkMcpError) || error.status !== 401) throw error;
      if (attempt === 1) {
        await markUpworkError("Credencial Upwork rechazada; vuelve a autorizarla");
        throw new UpworkMcpError("La credencial Upwork fue rechazada; vuelve a autorizarla", 401);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new UpworkMcpError("No se pudo conectar con Upwork MCP");
}

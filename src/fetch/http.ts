const USER_AGENT = "agent-audit/0.1 (+https://github.com/devladpopov/agent-audit) readiness-checker";
const TIMEOUT_MS = 10_000;

export interface FetchResult {
  status: number | null;
  ok: boolean;
  headers: Record<string, string>;
  body: string | null;
  finalUrl: string;
  error?: string;
}

export async function fetchUrl(url: string, init?: RequestInit): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "*/*", ...(init?.headers ?? {}) },
      ...init,
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, ok: res.ok, headers, body, finalUrl: res.url || url };
  } catch (err) {
    return {
      status: null,
      ok: false,
      headers: {},
      body: null,
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve a path against a base URL's origin, e.g. joinPath("https://x.com/a", "/robots.txt"). */
export function joinPath(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  return new URL(path, base.origin).toString();
}

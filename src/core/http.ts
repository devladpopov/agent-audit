export const TOOL_USER_AGENT = "agent-audit/0.1 (+https://github.com/devladpopov/agent-audit) readiness-checker";

/** Plain desktop-browser headers, used only to tell "blocks automated clients" apart from "site is down". */
export const BROWSER_HEADERS: Record<string, string> = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9",
};

const TIMEOUT_MS = 10_000;

export interface FetchResult {
  status: number | null;
  ok: boolean;
  headers: Record<string, string>;
  body: string | null;
  finalUrl: string;
  error?: string;
}

export async function fetchUrl(url: string, headers?: Record<string, string>): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": TOOL_USER_AGENT, accept: "*/*", ...(headers ?? {}) },
    });
    const body = await res.text();
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (resHeaders[k] = v));
    return { status: res.status, ok: res.ok, headers: resHeaders, body, finalUrl: res.url || url };
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

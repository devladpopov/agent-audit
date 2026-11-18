/**
 * Known AI/agent crawler user-agents worth checking in robots.txt.
 * Source: publicly documented bot names from OpenAI, Google, Anthropic, Perplexity, Apple (Sept 2026).
 * This list will go stale — keep it updated as new agents ship.
 */
export const AGENT_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Google-Extended",
  "Googlebot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot-Extended",
] as const;

/**
 * Agents that fetch pages because a person asked for something (an answer, a search result, a
 * shopping task). Blocking these hides the store from live AI shopping and answers.
 * Source: OpenAI, Perplexity and Anthropic crawler docs (Nov 2026).
 */
export const USER_TRIGGERED_AGENTS = [
  "ChatGPT-User",
  "OAI-SearchBot",
  "Perplexity-User",
  "PerplexityBot",
  "Claude-User",
  "Claude-SearchBot",
] as const;

/**
 * Crawlers (or robots.txt-only control tokens) that collect content for model training.
 * Blocking them is a legitimate business choice and does not stop live shopping agents.
 */
export const TRAINING_AGENTS = ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "Applebot-Extended"] as const;

interface RobotsRuleSet {
  userAgent: string;
  disallow: string[];
  allow: string[];
}

export function parseRobots(body: string): RobotsRuleSet[] {
  const groups: RobotsRuleSet[] = [];
  let current: RobotsRuleSet[] = [];
  // Consecutive User-agent lines share the rules that follow them (RFC 9309 section 2.1).
  let lastWasUserAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      // RFC 9309: consecutive user-agent lines form one group; the rules that follow apply to all of them.
      if (!lastWasUserAgent) current = [];
      lastWasUserAgent = true;
      const existing = groups.find((g) => g.userAgent.toLowerCase() === value.toLowerCase());
      if (existing) {
        if (!current.includes(existing)) current.push(existing);
      } else {
        const g: RobotsRuleSet = { userAgent: value, disallow: [], allow: [] };
        groups.push(g);
        current.push(g);
      }
      continue;
    }
    lastWasUserAgent = false;
    if (key === "disallow" && value !== undefined) {
      for (const g of current) g.disallow.push(value);
    } else if (key === "allow" && value !== undefined) {
      for (const g of current) g.allow.push(value);
    }
  }
  return groups;
}

/** The group that applies to a user-agent: its own group if present, otherwise the wildcard one. */
function groupFor(groups: RobotsRuleSet[], userAgent: string): RobotsRuleSet | undefined {
  return (
    groups.find((g) => g.userAgent.toLowerCase() === userAgent.toLowerCase()) ?? groups.find((g) => g.userAgent === "*")
  );
}

/** Does this robots.txt fully block a given agent user-agent from the whole site ("Disallow: /")? */
export function isFullyBlocked(groups: RobotsRuleSet[], userAgent: string): boolean {
  // A specific-UA group overrides the wildcard group if present.
  const group = groupFor(groups, userAgent);
  if (!group) return false;
  // An empty "Disallow:" value means "disallow nothing" per the robots.txt spec — it must NOT count as a block.
  return group.disallow.some((rule) => rule === "/");
}

/**
 * Sitemap URLs declared with "Sitemap:" lines (any group, per RFC 9309 they are global). Only URLs on the
 * store's own registrable domain are kept, so a robots.txt can't point the scanner at arbitrary hosts.
 */
export function sitemapsFromRobots(body: string, baseUrl: string): string[] {
  const root = (h: string) => h.replace(/^www\./, "").split(".").slice(-2).join(".");
  const base = new URL(baseUrl);
  const urls: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(rawLine);
    if (!m) continue;
    try {
      const u = new URL(m[1]!, base);
      if (/^https?:$/.test(u.protocol) && root(u.hostname) === root(base.hostname) && !urls.includes(u.toString())) {
        urls.push(u.toString());
      }
    } catch {
      // ignore malformed sitemap lines
    }
  }
  return urls;
}

/** Robots path pattern match: "*" is any run of characters, a trailing "$" anchors the end. */
function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/**
 * May this user-agent fetch this path? The longest matching rule wins and Allow wins a tie
 * (RFC 9309 section 2.2.2). Empty Disallow values are ignored, so "Disallow:" allows everything.
 */
export function isPathAllowed(groups: RobotsRuleSet[], userAgent: string, path: string): boolean {
  const group = groupFor(groups, userAgent);
  if (!group) return true;
  let best: { length: number; allow: boolean } | undefined;
  const consider = (rules: string[], allow: boolean) => {
    for (const rule of rules) {
      if (!rule || !patternMatches(rule, path)) continue;
      if (!best || rule.length > best.length || (rule.length === best.length && allow)) best = { length: rule.length, allow };
    }
  };
  consider(group.disallow, false);
  consider(group.allow, true);
  return best?.allow ?? true;
}

export interface ContentSignals {
  /** Raw "Content-Signal:" values, in file order. */
  lines: string[];
  /** Merged key=value pairs, e.g. { search: "yes", "ai-input": "yes", "ai-train": "no" }. */
  values: Record<string, string>;
}

/** Cloudflare Content Signals Policy lines in robots.txt, e.g. "Content-Signal: search=yes, ai-train=no". */
export function parseContentSignals(body: string): ContentSignals {
  const lines: string[] = [];
  const values: Record<string, string> = {};
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    const match = /^content-signal\s*:(.*)$/i.exec(line);
    const value = match?.[1]?.trim();
    if (!value) continue;
    lines.push(value);
    for (const pair of value.split(",")) {
      const [k, v] = pair.split("=").map((x) => x.trim().toLowerCase());
      if (k && v) values[k] = v;
    }
  }
  return { lines, values };
}

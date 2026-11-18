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

interface RobotsRuleSet {
  userAgent: string;
  disallow: string[];
  allow: string[];
}

export function parseRobots(body: string): RobotsRuleSet[] {
  const groups: RobotsRuleSet[] = [];
  let current: RobotsRuleSet[] = [];
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

/** Does this robots.txt fully block a given agent user-agent from the whole site ("Disallow: /")? */
export function isFullyBlocked(groups: RobotsRuleSet[], userAgent: string): boolean {
  const applicable = groups.filter(
    (g) => g.userAgent === "*" || g.userAgent.toLowerCase() === userAgent.toLowerCase(),
  );
  // A specific-UA group overrides the wildcard group if present.
  const specific = applicable.find((g) => g.userAgent.toLowerCase() === userAgent.toLowerCase());
  const group = specific ?? applicable.find((g) => g.userAgent === "*");
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

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
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      const existing = groups.find((g) => g.userAgent.toLowerCase() === value.toLowerCase());
      if (existing) {
        current = [existing];
      } else {
        const g: RobotsRuleSet = { userAgent: value, disallow: [], allow: [] };
        groups.push(g);
        current = [g];
      }
    } else if (key === "disallow" && value !== undefined) {
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

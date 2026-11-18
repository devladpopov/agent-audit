import type { CommerceContext, CommerceRule } from "../types.js";
import {
  AGENT_USER_AGENTS,
  TRAINING_AGENTS,
  USER_TRIGGERED_AGENTS,
  isFullyBlocked,
  isPathAllowed,
  parseContentSignals,
  parseRobots,
} from "../fetch/robots.js";
import { visibleTextLength } from "../fetch/html.js";

const CAPTCHA_MARKERS = ["cf-challenge", "g-recaptcha", "hcaptcha", "cf_chl_opt", "px-captcha"];

/** Paths an agent needs to reach to shop: the home page and the product page the report is built from. */
function shoppingPaths(ctx: CommerceContext): string[] {
  const paths = new Set<string>();
  for (const url of [ctx.finalUrl, ctx.product.url]) {
    try {
      const u = new URL(url);
      paths.add(u.pathname + u.search);
    } catch {
      // ignore unparsable URLs
    }
  }
  return [...paths];
}

export const agentAccessRules: CommerceRule[] = [
  {
    id: "agent-access.reachable",
    category: "agent-access",
    title: "Store answers identified automated clients",
    weight: 4,
    severity: "high",
    check(ctx) {
      const { toolStatus, browserStatus, usedBrowserFallback } = ctx.access;
      if (!usedBrowserFallback && toolStatus !== null && toolStatus < 400) {
        return { status: "pass", message: `Home page returned HTTP ${toolStatus} to an identified bot user-agent.` };
      }
      if (usedBrowserFallback) {
        return {
          status: "fail",
          message: `Home page returned HTTP ${toolStatus ?? "no response"} to an identified bot but ${browserStatus} to a browser. A WAF or bot filter is turning away automated clients; AI agents that are not explicitly allowlisted will be blocked the same way. The rest of this report was produced with browser headers.`,
          fixSuggestion: "Allow verified AI agent user-agents (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended) through your WAF/bot-protection rules, at least for product and policy pages.",
        };
      }
      return {
        status: "fail",
        message: `Home page did not load for either a bot (HTTP ${toolStatus ?? "no response"}) or a browser (HTTP ${browserStatus ?? "no response"}). Results below are unreliable.`,
      };
    },
  },
  {
    id: "agent-access.robots-not-blocking",
    category: "agent-access",
    title: "robots.txt allows known AI shopping agents",
    weight: 3,
    specUrl: "https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt",
    check(ctx) {
      if (!ctx.robotsTxt.fetched || !ctx.robotsTxt.body) {
        return { status: "info", message: "No robots.txt found — agents are unrestricted by default." };
      }
      const groups = parseRobots(ctx.robotsTxt.body);
      const blocked = AGENT_USER_AGENTS.filter((ua) => isFullyBlocked(groups, ua));
      if (blocked.length === 0) {
        return { status: "pass", message: "No known AI agent user-agent is fully disallowed." };
      }
      return {
        status: "fail",
        message: `robots.txt fully blocks: ${blocked.join(", ")}.`,
        fixSuggestion: `Remove or scope the "Disallow: /" rule for ${blocked.join(", ")} in robots.txt if you want these agents to see your catalog.`,
      };
    },
  },
  {
    id: "agent-access.ai-agent-policy",
    category: "agent-access",
    title: "robots.txt lets live AI shopping/answer agents reach product pages",
    weight: 3,
    specUrl: "https://www.rfc-editor.org/rfc/rfc9309.html",
    check(ctx) {
      if (!ctx.robotsTxt.fetched || !ctx.robotsTxt.body) {
        return { status: "info", message: "No robots.txt found — every AI agent is unrestricted by default." };
      }
      const groups = parseRobots(ctx.robotsTxt.body);
      const paths = shoppingPaths(ctx);
      const blockedFrom = (ua: string) => paths.filter((p) => !isPathAllowed(groups, ua, p));
      const liveBlocked = USER_TRIGGERED_AGENTS.filter((ua) => blockedFrom(ua).length > 0);
      const trainingBlocked = TRAINING_AGENTS.filter((ua) => blockedFrom(ua).length > 0);
      const trainingNote =
        trainingBlocked.length > 0
          ? ` Training crawlers blocked: ${trainingBlocked.join(", ")} (a business choice; it doesn't stop live agents).`
          : "";
      if (liveBlocked.length > 0) {
        const where = [...new Set(liveBlocked.flatMap(blockedFrom))].join(", ");
        return {
          status: "fail",
          message: `robots.txt blocks user-triggered/search AI agents from ${where}: ${liveBlocked.join(", ")}. These agents fetch pages when a shopper asks about a product, so the store drops out of those answers.${trainingNote}`,
          evidence: `Checked paths: ${paths.join(", ")}`,
          fixSuggestion: `Give ${liveBlocked.join(", ")} their own User-agent group that allows product and policy pages. To opt out of model training only, disallow GPTBot, ClaudeBot, CCBot and Google-Extended instead.`,
        };
      }
      if (trainingBlocked.length > 0) {
        return {
          status: "pass",
          message: `Live AI shopping/search agents can reach product pages.${trainingNote}`,
          evidence: `Checked paths: ${paths.join(", ")}`,
        };
      }
      return {
        status: "pass",
        message: "Live AI shopping/search agents and training crawlers can all reach product pages.",
        evidence: `Checked paths: ${paths.join(", ")}`,
      };
    },
  },
  {
    id: "agent-access.content-signals",
    category: "agent-access",
    title: "robots.txt declares AI content-use signals",
    weight: 1,
    specUrl: "https://contentsignals.org/",
    check(ctx) {
      if (!ctx.robotsTxt.fetched || !ctx.robotsTxt.body) {
        return { status: "skip", message: "No robots.txt to inspect." };
      }
      const signals = parseContentSignals(ctx.robotsTxt.body);
      if (signals.lines.length === 0) {
        return {
          status: "info",
          message: "No Content-Signal lines in robots.txt. Optional: they state whether your content may be used for search, live AI answers (ai-input) and training (ai-train).",
        };
      }
      const summary = Object.entries(signals.values)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      if (signals.values["ai-input"] === "no") {
        return {
          status: "warn",
          message: `Content-Signal sets ai-input=no (${summary}). This asks AI agents not to use your pages to answer shoppers in real time, which is how agentic shopping works.`,
          fixSuggestion: "Set ai-input=yes (keep ai-train=no if you want to opt out of training) so answer and shopping agents may use your product pages.",
        };
      }
      return { status: "pass", message: `Content-Signal declared: ${summary}.` };
    },
  },
  {
    id: "agent-access.llms-txt",
    category: "agent-access",
    title: "llms.txt is published",
    weight: 2,
    specUrl: "https://llmstxt.org/",
    async check(ctx) {
      const probe = await ctx.fetchText("/llms.txt");
      if (probe.ok) {
        return { status: "pass", message: "llms.txt found." };
      }
      return {
        status: "warn",
        message: "No /llms.txt found.",
        fixSuggestion: "Publish a /llms.txt summarizing your site and linking key product/catalog pages for LLMs.",
      };
    },
  },
  {
    id: "agent-access.no-js-required",
    category: "agent-access",
    title: "Page has meaningful content without executing JavaScript",
    weight: 3,
    check(ctx) {
      const len = visibleTextLength(ctx.home.$);
      if (len > 800) return { status: "pass", message: `~${len} chars of text rendered without JS.` };
      if (len > 200)
        return {
          status: "warn",
          message: `Only ~${len} chars of text present in the static HTML — page may rely heavily on client-side rendering.`,
          fixSuggestion: "Server-render (SSR) product listing/detail content so agents that don't execute JS can read it.",
        };
      return {
        status: "fail",
        message: `Only ~${len} chars of text in the static HTML — most agents will see an empty page.`,
        fixSuggestion: "Server-render (SSR) or statically generate product pages; most shopping agents do not execute JavaScript.",
      };
    },
  },
  {
    id: "agent-access.no-captcha-wall",
    category: "agent-access",
    title: "No anti-bot wall on the landing page",
    weight: 2,
    check(ctx) {
      const html = ctx.home.html.toLowerCase();
      const hit = CAPTCHA_MARKERS.find((m) => html.includes(m));
      if (!hit) return { status: "pass", message: "No obvious CAPTCHA/challenge markers detected." };
      return {
        status: "warn",
        message: `Detected a possible bot-challenge marker ("${hit}") on the entry page.`,
        fixSuggestion: "Verify your WAF/anti-bot rules allow known AI agent user-agents and IP ranges to reach product pages.",
      };
    },
  },
];

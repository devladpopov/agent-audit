import type { Rule } from "../core/types.js";
import { AGENT_USER_AGENTS, isFullyBlocked, parseRobots } from "../fetch/robots.js";
import { visibleTextLength } from "../fetch/html.js";

const CAPTCHA_MARKERS = ["cf-challenge", "g-recaptcha", "hcaptcha", "cf_chl_opt", "px-captcha"];

export const agentAccessRules: Rule[] = [
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
      const len = visibleTextLength(ctx.$);
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
      const html = ctx.html.toLowerCase();
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

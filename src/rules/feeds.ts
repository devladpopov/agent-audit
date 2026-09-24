import type { Rule } from "../core/types.js";

const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"];
const FEED_PATHS = [
  "/feed/google-merchant.xml",
  "/products.xml",
  "/product_feed.xml",
  "/googlefeed.xml",
  "/feeds/products.xml",
];

export const feedsRules: Rule[] = [
  {
    id: "feeds.sitemap-present",
    category: "feeds",
    title: "sitemap.xml is reachable",
    weight: 2,
    specUrl: "https://www.sitemaps.org/protocol.html",
    async check(ctx) {
      for (const path of SITEMAP_PATHS) {
        const probe = await ctx.fetchText(path);
        if (probe.ok) return { status: "pass", message: `Sitemap found at ${path}.` };
      }
      return {
        status: "warn",
        message: "No sitemap.xml or sitemap_index.xml found.",
        fixSuggestion: "Publish an XML sitemap covering product URLs and reference it from robots.txt.",
      };
    },
  },
  {
    id: "feeds.sitemap-has-products",
    category: "feeds",
    title: "Sitemap looks like it includes product URLs",
    weight: 1,
    check(ctx) {
      // Best-effort heuristic: this rule inspects the sitemap probes already fetched by feeds.sitemap-present
      // via ctx.wellKnown (populated by the engine for every path any rule has requested so far).
      const sitemap = SITEMAP_PATHS.map((p) => ctx.wellKnown[p]).find((p) => p?.ok && p.body);
      if (!sitemap?.body) return { status: "skip", message: "No sitemap body available to inspect." };
      const looksLikeProducts = /\/(product|products|shop|item|p)\//i.test(sitemap.body);
      if (looksLikeProducts) return { status: "pass", message: "Sitemap references product-like URLs." };
      return {
        status: "info",
        message: "Could not confirm product URLs in the sitemap (may be a sitemap index).",
      };
    },
  },
  {
    id: "feeds.merchant-feed-hint",
    category: "feeds",
    title: "A Google Merchant-style product feed is discoverable",
    weight: 2,
    specUrl: "https://support.google.com/merchants/answer/7052112",
    async check(ctx) {
      for (const path of FEED_PATHS) {
        const probe = await ctx.fetchText(path);
        if (probe.ok) return { status: "pass", message: `Product feed found at ${path}.` };
      }
      const linked = ctx.$('link[type="application/rss+xml"], link[type="application/atom+xml"]').length > 0;
      if (linked) {
        return { status: "warn", message: "A feed <link> tag exists, but not at a common product-feed path — could not confirm it's a product feed." };
      }
      return {
        status: "info",
        message: "No product feed found at common paths. Feeds submitted directly to Google Merchant Center / ACP are not publicly discoverable this way.",
        fixSuggestion: "If you already submit a feed privately (Merchant Center, ChatGPT Shopping), this check can be safely ignored; otherwise publish one.",
      };
    },
  },
];

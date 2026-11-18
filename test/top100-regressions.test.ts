import { afterEach, describe, expect, test } from "bun:test";
import { scanStore } from "../src/commerce/engine.js";
import { extractJsonLd, findByType, findProducts, loadHtml } from "../src/commerce/fetch/html.js";
import { isFullyBlocked, parseRobots, sitemapsFromRobots } from "../src/commerce/fetch/robots.js";
import { detectPlatform } from "../src/commerce/platform.js";
import { feedsRules } from "../src/commerce/rules/feeds.js";
import { productDataRules } from "../src/commerce/rules/product-data.js";
import { protocolEndpointRules } from "../src/commerce/rules/protocol-endpoints.js";
import type { CommerceContext, CommerceRule, PageSnapshot, WellKnownProbe } from "../src/commerce/types.js";

// Regressions found by the 100-store run (research/top100).

function page(html: string, url = "https://example.com/"): PageSnapshot {
  const $ = loadHtml(html);
  return { url, html, $, jsonLd: extractJsonLd($) };
}

function ld(...blocks: unknown[]): string {
  return blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("");
}

function ctxWith(opts: { product?: PageSnapshot; robots?: string; files?: Record<string, string> }): CommerceContext {
  const home = page("<html></html>");
  const wellKnown: Record<string, WellKnownProbe> = {};
  return {
    inputUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    statusCode: 200,
    home,
    product: opts.product ?? home,
    productSource: "input",
    access: { toolStatus: 200, browserStatus: null, usedBrowserFallback: false },
    headers: {},
    robotsTxt: { fetched: opts.robots !== undefined, body: opts.robots ?? null },
    wellKnown,
    async fetchText(path) {
      const body = opts.files?.[path];
      const probe: WellKnownProbe = { path, status: body === undefined ? 404 : 200, ok: body !== undefined, body };
      wellKnown[path] = probe;
      return probe;
    },
  };
}

async function run(rules: CommerceRule[], id: string, ctx: CommerceContext) {
  const rule = rules.find((r) => r.id === id)!;
  return rule.check(ctx);
}

describe("Product entities nested in ProductGroup / arrays (skims.com)", () => {
  // Shape of skims.com product pages: ProductGroup with brand/image at the group level, offers on each variant.
  const skims = {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: "SHEER MODAL LONG SLEEVE BOATNECK TOP",
    brand: { "@type": "Brand", name: "SKIMS" },
    image: ["https://cdn.example.com/top.jpg"],
    productGroupID: "LS-LST-6143W",
    variesBy: ["https://schema.org/size"],
    hasVariant: ["XS", "S"].map((size) => ({
      "@type": "Product",
      name: `TOP | ${size}`,
      sku: `LS-LST-6143W-${size}`,
      offers: { "@type": "Offer", price: 54, priceCurrency: "GBP", availability: "https://schema.org/InStock" },
    })),
  };

  test("finds variant Products inside ProductGroup.hasVariant", () => {
    const p = page(ld(skims));
    expect(findProducts(p.jsonLd)).toHaveLength(2);
  });

  test("variants inherit group-level brand and image", () => {
    const [first] = findProducts(page(ld(skims)).jsonLd);
    expect(first!.brand).toEqual({ "@type": "Brand", name: "SKIMS" });
    expect(first!.image).toEqual(["https://cdn.example.com/top.jpg"]);
    expect(first!.hasVariant).toBeUndefined();
  });

  test("product-data rules pass on a ProductGroup page instead of 'No Product entity'", async () => {
    const ctx = ctxWith({ product: page(ld(skims)) });
    for (const id of [
      "product-data.has-product-type",
      "product-data.offer-price-currency",
      "product-data.availability",
      "product-data.identifier",
      "product-data.brand-and-image",
    ]) {
      expect((await run(productDataRules, id, ctx)).status, id).toBe("pass");
    }
  });

  test("group offers are used when variants have none", async () => {
    const group = {
      "@type": "ProductGroup",
      offers: { "@type": "AggregateOffer", lowPrice: 10, price: 10, priceCurrency: "USD" },
      hasVariant: [{ "@type": "Product", sku: "a" }],
    };
    const ctx = ctxWith({ product: page(ld(group)) });
    expect((await run(productDataRules, "product-data.offer-price-currency", ctx)).status).toBe("pass");
  });

  test("a ProductGroup without Product variants counts as the product", () => {
    expect(findProducts(page(ld({ "@type": "ProductGroup", name: "x" })).jsonLd)).toHaveLength(1);
  });

  test("matches array @type and prefixed type names", () => {
    const p = page(ld({ "@type": ["Product", "Car"], name: "a" }, { "@type": "schema:Product", name: "b" }));
    expect(findByType(p.jsonLd, "Product")).toHaveLength(2);
  });

  test("finds Product nested in another node (Offer.itemOffered, @graph)", () => {
    const p = page(ld({ "@graph": [{ "@type": "WebPage", mainEntity: { "@type": "Product", name: "a" } }] }));
    expect(findProducts(p.jsonLd)).toHaveLength(1);
  });

  test("related products are not counted as the page's product", () => {
    const p = page(ld({ "@type": "WebPage", relatedLink: "x", isRelatedTo: { "@type": "Product", name: "other" } }));
    expect(findProducts(p.jsonLd)).toHaveLength(0);
  });
});

describe("Platform detection: Shopify is not mistaken for Magento", () => {
  test("Shopify page whose inline JS mentions form_key", () => {
    const html = '<script>var Shopify = Shopify || {}; Shopify.theme = {"name":"x"}; var cfg = {form_key: null};</script>';
    expect(detectPlatform([page(html)], {}).platform).toBe("shopify");
  });

  test("Shopify via powered-by header even with cdn.shopify.com absent", () => {
    expect(detectPlatform([page("<script>form_key</script>")], { "Powered-By": "Shopify" }).platform).toBe("shopify");
  });

  test("bare form_key text in JS is no longer a Magento signal", () => {
    expect(detectPlatform([page("<script>window.form_key = 1</script>")], {}).platform).toBe("other");
  });

  test("Magento still detected via x-magento-init", () => {
    expect(detectPlatform([page('<script type="text/x-magento-init">{}</script>')], {}).platform).toBe("magento");
  });
});

describe("UCP manifest shapes (Shopify, Zara, IKEA)", () => {
  // Current spec: everything under "ucp", services/payment_handlers keyed by reverse-domain name.
  const nested = JSON.stringify({
    ucp: {
      version: "2026-08-25",
      services: { "dev.ucp.shopping": [{ version: "2026-08-25", transport: "mcp", endpoint: "https://x/api/ucp/mcp" }] },
      payment_handlers: { "com.google.pay": [{ id: "1" }], "dev.shopify.shop_pay": [{ id: "2" }] },
    },
    signing_keys: [],
  });

  test("nested ucp object with services map passes", async () => {
    const ctx = ctxWith({ files: { "/.well-known/ucp": nested } });
    const outcome = await run(protocolEndpointRules, "protocol.ucp-manifest", ctx);
    expect(outcome.status).toBe("pass");
    expect(outcome.message).toContain("dev.ucp.shopping");
  });

  test("payment_handlers map is counted for AP2", async () => {
    const ctx = ctxWith({ files: { "/.well-known/ucp": nested } });
    await ctx.fetchText("/.well-known/ucp");
    const outcome = await run(protocolEndpointRules, "protocol.ap2-note", ctx);
    expect(outcome.status).toBe("pass");
    expect(outcome.message).toContain("2 payment handler");
  });

  test("legacy top-level shape with services array still passes", async () => {
    const ctx = ctxWith({ files: { "/.well-known/ucp": JSON.stringify({ version: "1", services: [{ name: "x" }] }) } });
    expect((await run(protocolEndpointRules, "protocol.ucp-manifest", ctx)).status).toBe("pass");
  });

  test("JSON body with a BOM still parses", async () => {
    const ctx = ctxWith({ files: { "/.well-known/ucp": "\uFEFF" + nested } });
    expect((await run(protocolEndpointRules, "protocol.ucp-manifest", ctx)).status).toBe("pass");
  });
});

describe("Sitemaps declared in robots.txt", () => {
  const robots = "User-agent: *\nDisallow: /cart\nSitemap: https://www.example.com/sitemaps/index.xml\nSitemap: https://evil.test/s.xml\n";

  test("sitemapsFromRobots keeps same-site URLs only", () => {
    expect(sitemapsFromRobots(robots, "https://example.com/")).toEqual(["https://www.example.com/sitemaps/index.xml"]);
  });

  test("feeds.sitemap-present uses the robots.txt Sitemap line", async () => {
    const ctx = ctxWith({
      robots,
      files: { "https://www.example.com/sitemaps/index.xml": "<urlset><url><loc>https://example.com/products/a</loc></url></urlset>" },
    });
    const outcome = await run(feedsRules, "feeds.sitemap-present", ctx);
    expect(outcome.status).toBe("pass");
    expect(outcome.message).toContain("/sitemaps/index.xml");
    expect((await run(feedsRules, "feeds.sitemap-has-products", ctx)).status).toBe("pass");
  });
});

describe("robots.txt groups with several User-agent lines (RFC 9309, eBay)", () => {
  test("consecutive User-agent lines share the rules that follow", () => {
    const groups = parseRobots("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\n");
    expect(isFullyBlocked(groups, "GPTBot")).toBe(true);
    expect(isFullyBlocked(groups, "ClaudeBot")).toBe(true);
    expect(isFullyBlocked(groups, "PerplexityBot")).toBe(false);
  });

  test("a User-agent line after rules starts a new group", () => {
    const groups = parseRobots("User-agent: GPTBot\nDisallow: /\nUser-agent: ClaudeBot\nDisallow: /private\n");
    expect(isFullyBlocked(groups, "GPTBot")).toBe(true);
    expect(isFullyBlocked(groups, "ClaudeBot")).toBe(false);
  });
});

describe("Site refusing even a browser", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("robots.txt is still fetched and evaluated", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n", { status: 200 });
      return new Response("Access denied", { status: 403 });
    }) as typeof fetch;
    const result = await scanStore("https://blocked.example/");
    const robots = result.findings.find((f) => f.id === "agent-access.robots-not-blocking");
    expect(robots?.status).toBe("fail");
    expect(result.findings.find((f) => f.id === "product-data.has-jsonld")).toBeUndefined();
  });
});

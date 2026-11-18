import { describe, expect, test } from "bun:test";
import { extractJsonLd, loadHtml } from "../src/commerce/fetch/html.js";
import { ALL_RULES } from "../src/commerce/rules/index.js";
import { isValidGtin } from "../src/commerce/rules/product-data.js";
import type { CommerceContext, PageSnapshot, WellKnownProbe } from "../src/commerce/types.js";

function page(url: string, jsonLd: unknown[] = []): PageSnapshot {
  const scripts = jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("");
  const html = `<html><head>${scripts}</head><body></body></html>`;
  const $ = loadHtml(html);
  return { url, html, $, jsonLd: extractJsonLd($) };
}

interface CtxOptions {
  robots?: string;
  homeJsonLd?: unknown[];
  productJsonLd?: unknown[];
  productUrl?: string;
  files?: Record<string, string>;
}

function ctx(opts: CtxOptions = {}): CommerceContext {
  const home = page("https://shop.example/", opts.homeJsonLd);
  const product = opts.productJsonLd ? page(opts.productUrl ?? "https://shop.example/products/shoe", opts.productJsonLd) : home;
  const wellKnown: Record<string, WellKnownProbe> = {};
  return {
    inputUrl: "https://shop.example/",
    finalUrl: "https://shop.example/",
    statusCode: 200,
    home,
    product,
    productSource: opts.productJsonLd ? "discovered" : "homepage-fallback",
    access: { toolStatus: 200, browserStatus: null, usedBrowserFallback: false },
    headers: {},
    robotsTxt: { fetched: opts.robots !== undefined, body: opts.robots ?? null },
    wellKnown,
    async fetchText(path) {
      const body = opts.files?.[path];
      const probe: WellKnownProbe = body === undefined ? { path, status: 404, ok: false } : { path, status: 200, ok: true, body };
      wellKnown[path] = probe;
      return probe;
    },
  };
}

async function run(id: string, c: CommerceContext) {
  const rule = ALL_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`no rule ${id}`);
  return rule.check(c);
}

const offer = { "@type": "Offer", price: "10.00", priceCurrency: "GBP" };

describe("rule registry", () => {
  test("rule ids are unique", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("agent-access.ai-agent-policy", () => {
  test("fails when a user-triggered agent is blocked from the product page", async () => {
    const robots = "User-agent: ChatGPT-User\nDisallow: /products/\n\nUser-agent: *\nDisallow:\n";
    const out = await run("agent-access.ai-agent-policy", ctx({ robots, productJsonLd: [{ "@type": "Product" }] }));
    expect(out.status).toBe("fail");
    expect(out.message).toContain("ChatGPT-User");
    expect(out.message).toContain("/products/shoe");
  });

  test("training-only blocks pass with a note", async () => {
    const robots = "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\n";
    const out = await run("agent-access.ai-agent-policy", ctx({ robots }));
    expect(out.status).toBe("pass");
    expect(out.message).toContain("GPTBot, CCBot");
  });

  test("everything open passes", async () => {
    expect((await run("agent-access.ai-agent-policy", ctx({ robots: "User-agent: *\nDisallow:\n" }))).status).toBe("pass");
  });

  test("no robots.txt is info", async () => {
    expect((await run("agent-access.ai-agent-policy", ctx())).status).toBe("info");
  });
});

describe("agent-access.content-signals", () => {
  test("absent -> info", async () => {
    expect((await run("agent-access.content-signals", ctx({ robots: "User-agent: *\nDisallow:\n" }))).status).toBe("info");
  });

  test("declared -> pass", async () => {
    const out = await run("agent-access.content-signals", ctx({ robots: "Content-Signal: search=yes, ai-train=no\nUser-agent: *\n" }));
    expect(out.status).toBe("pass");
    expect(out.message).toContain("ai-train=no");
  });

  test("ai-input=no -> warn", async () => {
    const out = await run("agent-access.content-signals", ctx({ robots: "Content-Signal: search=yes, ai-input=no\n" }));
    expect(out.status).toBe("warn");
  });

  test("no robots.txt -> skip", async () => {
    expect((await run("agent-access.content-signals", ctx())).status).toBe("skip");
  });
});

describe("protocol.mcp-discovery", () => {
  test("valid server card -> pass", async () => {
    const files = { "/.well-known/mcp/server-card.json": JSON.stringify({ serverInfo: { name: "shop-mcp" } }) };
    const out = await run("protocol.mcp-discovery", ctx({ files }));
    expect(out.status).toBe("pass");
    expect(out.message).toContain("shop-mcp");
  });

  test("non-JSON body -> warn", async () => {
    expect((await run("protocol.mcp-discovery", ctx({ files: { "/.well-known/mcp": "hello" } }))).status).toBe("warn");
  });

  test("UCP manifest with an MCP transport counts", async () => {
    const c = ctx();
    c.wellKnown["/.well-known/ucp"] = {
      path: "/.well-known/ucp",
      status: 200,
      ok: true,
      body: JSON.stringify({ version: "1", services: [{ transport: "mcp", endpoint: "https://shop.example/api/mcp" }] }),
    };
    expect((await run("protocol.mcp-discovery", c)).status).toBe("pass");
  });

  test("nothing -> info (not scored)", async () => {
    expect((await run("protocol.mcp-discovery", ctx())).status).toBe("info");
  });
});

describe("protocol.oauth-discovery", () => {
  test("authorization-server metadata with issuer -> pass", async () => {
    const files = { "/.well-known/openid-configuration": JSON.stringify({ issuer: "https://shop.example", token_endpoint: "x" }) };
    expect((await run("protocol.oauth-discovery", ctx({ files }))).status).toBe("pass");
  });

  test("JSON without issuer -> warn", async () => {
    const files = { "/.well-known/oauth-authorization-server": "{}" };
    expect((await run("protocol.oauth-discovery", ctx({ files }))).status).toBe("warn");
  });

  test("nothing -> info", async () => {
    expect((await run("protocol.oauth-discovery", ctx())).status).toBe("info");
  });
});

describe("isValidGtin", () => {
  test.each(["96385074", "036000291452", "4006381333931", "00012345600012", "400-638-1333931", "https://id.gs1.org/01/04006381333931"])(
    "%s is valid",
    (gtin) => {
      expect(isValidGtin(gtin)).toBe(true);
    },
  );

  test.each(["4006381333932", "12345", "40063813339310000", "abc", "0000000000000"])("%s is invalid", (gtin) => {
    expect(isValidGtin(gtin)).toBe(false);
  });
});

describe("product-data.gtin-valid", () => {
  test("skips when there is no GTIN", async () => {
    expect((await run("product-data.gtin-valid", ctx({ productJsonLd: [{ "@type": "Product", sku: "A1" }] }))).status).toBe("skip");
  });

  test("fails on a bad check digit, including GTINs on offers", async () => {
    const product = { "@type": "Product", gtin13: "4006381333931", offers: { ...offer, gtin13: "4006381333932" } };
    const out = await run("product-data.gtin-valid", ctx({ productJsonLd: [product] }));
    expect(out.status).toBe("fail");
    expect(out.message).toContain("1/2");
  });

  test("checks variants inside a ProductGroup", async () => {
    const group = { "@type": "ProductGroup", hasVariant: [{ "@type": "Product", gtin: "036000291452" }] };
    expect((await run("product-data.gtin-valid", ctx({ productJsonLd: [group] }))).status).toBe("pass");
  });
});

describe("product-data.variants", () => {
  test("ProductGroup with hasVariant -> pass", async () => {
    const group = {
      "@type": "ProductGroup",
      variesBy: ["https://schema.org/size", "https://schema.org/color"],
      hasVariant: [{ "@type": "Product" }, { "@type": "Product" }],
    };
    const out = await run("product-data.variants", ctx({ productJsonLd: [group] }));
    expect(out.status).toBe("pass");
    expect(out.message).toContain("size, color");
  });

  test("several offers without a ProductGroup -> info with a fix", async () => {
    const out = await run("product-data.variants", ctx({ productJsonLd: [{ "@type": "Product", offers: [offer, offer] }] }));
    expect(out.status).toBe("info");
    expect(out.fixSuggestion).toBeDefined();
  });

  test("no product -> skip", async () => {
    expect((await run("product-data.variants", ctx())).status).toBe("skip");
  });
});

describe("product-data.reviews", () => {
  test("aggregateRating -> pass", async () => {
    const product = { "@type": "Product", aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6, reviewCount: 120 } };
    const out = await run("product-data.reviews", ctx({ productJsonLd: [product] }));
    expect(out.status).toBe("pass");
    expect(out.message).toContain("4.6");
  });

  test("no ratings -> warn", async () => {
    expect((await run("product-data.reviews", ctx({ productJsonLd: [{ "@type": "Product" }] }))).status).toBe("warn");
  });
});

describe("trust.organization-schema", () => {
  test("complete Organization -> pass", async () => {
    const org = { "@type": "Organization", name: "Shop", url: "https://shop.example/", sameAs: ["https://instagram.com/shop"] };
    expect((await run("trust.organization-schema", ctx({ homeJsonLd: [org] }))).status).toBe("pass");
  });

  test("Organization nested as WebSite publisher counts", async () => {
    const site = { "@type": "WebSite", publisher: { "@type": "OnlineStore", name: "Shop", url: "https://shop.example/", email: "hi@shop.example" } };
    expect((await run("trust.organization-schema", ctx({ homeJsonLd: [site] }))).status).toBe("pass");
  });

  test("incomplete Organization -> warn naming what is missing", async () => {
    const out = await run("trust.organization-schema", ctx({ homeJsonLd: [{ "@type": "Organization", name: "Shop" }] }));
    expect(out.status).toBe("warn");
    expect(out.message).toContain("url");
    expect(out.message).toContain("contactPoint");
  });

  test("absent -> warn", async () => {
    expect((await run("trust.organization-schema", ctx())).status).toBe("warn");
  });
});

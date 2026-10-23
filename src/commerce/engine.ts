import { BROWSER_HEADERS, fetchUrl, joinPath } from "../core/http.js";
import { runRules } from "../core/runner.js";
import { scoreCategory } from "../core/scorer.js";
import type { Finding, ScanResult } from "../core/types.js";
import { extractJsonLd, findByType, loadHtml } from "./fetch/html.js";
import { platformFix } from "./platform-fixes.js";
import { detectPlatform } from "./platform.js";
import { productDataRules } from "./rules/product-data.js";
import { ALL_RULES } from "./rules/index.js";
import { COMMERCE_CATEGORIES, type CommerceContext, type PageSnapshot, type WellKnownProbe } from "./types.js";

export const TOOL_NAME = "agent-audit";
export const TOOL_VERSION = "0.1.1";

export interface CommerceScanOptions {
  /** Explicit product page to use for product-data checks (skips discovery). */
  productUrl?: string;
  /** Max number of discovered product pages to sample for the median product-data score (default 3). */
  maxProductSamples?: number;
}

const PRODUCT_DATA_CATEGORY = COMMERCE_CATEGORIES.find((c) => c.id === "product-data")!;

/** Runs only the product-data rules against one page. Used to compare candidate product pages
 * before picking which one the report is built from; not part of the reported findings itself. */
async function scoreProductPage(ctx: CommerceContext): Promise<number> {
  const findings: Finding[] = [];
  for (const rule of productDataRules) {
    try {
      const outcome = await rule.check(ctx);
      findings.push({ id: rule.id, category: rule.category, title: rule.title, weight: rule.weight, ...outcome });
    } catch {
      findings.push({ id: rule.id, category: rule.category, title: rule.title, weight: rule.weight, status: "skip", message: "" });
    }
  }
  return scoreCategory(PRODUCT_DATA_CATEGORY, findings).score ?? 0;
}

/** Lower-of-two-middles median index, so picking among 2 candidates is deterministic. */
function medianIndex(n: number): number {
  return Math.floor((n - 1) / 2);
}

/** URL shapes that almost always mean a single product (WooCommerce, OpenCart, many custom stores). */
const STRONG_PRODUCT_PATH_RE = /\/(product|products|p|item|items|personalized-products)\/[^/?#]+\/?$/i;
const STRONG_PRODUCT_QUERY_RE = /route=product\/product|[?&]product_id=/i;
const isStrongProductUrl = (u: URL) => STRONG_PRODUCT_PATH_RE.test(u.pathname) || STRONG_PRODUCT_QUERY_RE.test(u.search);
/** Weaker hints: Magento ".html" pages, PrestaShop "123-slug" ids. */
const WEAK_PRODUCT_RE = /\.html$|\/\d+-[a-z0-9-]+(\.html)?$/i;
/** Paths that are never a single product page. */
const NOT_PRODUCT_RE =
  /\/(category|categories|collections?|all-collections|blog|news|about|contact|help|faq|account|login|register|cart|basket|checkout|wishlist|search|policy|policies|privacy|terms|returns|delivery|shipping|stores?|careers|pages?)(\/|$)|\/shop\/?$/i;
const MAX_PRODUCT_CANDIDATES = 8;

function snapshot(url: string, html: string): PageSnapshot {
  const $ = loadHtml(html);
  return { url, html, $, jsonLd: extractJsonLd($) };
}

function hasMicrodataProduct(page: PageSnapshot): boolean {
  return page.$('[itemtype*="schema.org/Product" i]').length > 0;
}

function isOgProduct(page: PageSnapshot): boolean {
  return /product/i.test(page.$('meta[property="og:type"]').attr("content") ?? "");
}

function hasProduct(page: PageSnapshot): boolean {
  return findByType(page.jsonLd, "Product").length > 0 || hasMicrodataProduct(page);
}

/** Registrable-domain match so shop.example.com counts for example.com (approximate, no PSL). */
function sameSite(a: URL, b: URL): boolean {
  const root = (h: string) => h.replace(/^www\./, "").split(".").slice(-2).join(".");
  return root(a.hostname) === root(b.hostname);
}

function rankProductUrl(u: URL): number {
  if (NOT_PRODUCT_RE.test(u.pathname)) return 0;
  if (isStrongProductUrl(u)) return 3;
  if (WEAK_PRODUCT_RE.test(u.pathname)) return 2;
  // Two-segment slugs (/outdoor-beds/bali-low-bed) are often products on custom stores.
  if (u.pathname.split("/").filter(Boolean).length >= 2) return 1;
  return 0;
}

/** A 200 that is really an HTML page (SPA fallback / soft 404) must not count as a found file. */
function looksLikeHtmlDocument(body: string | null): boolean {
  if (!body) return false;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

/** Same-site links from the page, best product candidates first. */
function productLinksFromPage(page: PageSnapshot): string[] {
  const base = new URL(page.url);
  const ranked = new Map<string, number>();
  page.$("a[href]").each((_i, el) => {
    const href = page.$(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, page.url);
      abs.hash = "";
      if (!/^https?:$/.test(abs.protocol) || !sameSite(abs, base) || abs.toString() === base.toString()) return;
      let rank = rankProductUrl(abs);
      if (rank === 0) return;
      // Product cards: link wraps an image or sits next to a price. Menus: header/nav/footer.
      const a = page.$(el);
      if (a.find("img, picture").length > 0) rank += 0.5;
      if (/[£$€]\s?\d/.test(a.parent().text())) rank += 0.5;
      if (a.closest("header, nav, footer, [role=navigation]").length > 0) rank -= 1.5;
      const key = abs.toString();
      if (rank > 0) ranked.set(key, Math.max(rank, ranked.get(key) ?? 0));
    } catch {
      // ignore malformed hrefs
    }
  });
  return [...ranked.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

function locsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
}

async function productLinksFromSitemap(
  fetchText: CommerceContext["fetchText"],
  headers: Record<string, string> | undefined,
): Promise<string[]> {
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    const probe = await fetchText(path);
    if (!probe.ok || !probe.body) continue;
    const locs = locsFromSitemap(probe.body);
    const productLocs = locs.filter((l) => {
      try {
        return !l.endsWith(".xml") && isStrongProductUrl(new URL(l));
      } catch {
        return false;
      }
    });
    if (productLocs.length > 0) return productLocs;
    // Sitemap index: follow the child sitemap that looks like it lists products
    // (Yoast "product-sitemap.xml", Magento/Presta "sitemap-products.xml", ...).
    const child = locs.find((l) => l.endsWith(".xml") && /product/i.test(l));
    if (child) {
      const res = await fetchUrl(child, headers);
      // The first entry of a product sitemap is often the shop archive page, so skip it.
      if (res.ok && res.body) return locsFromSitemap(res.body).filter((l) => !l.endsWith(".xml")).slice(1);
    }
  }
  return [];
}

export async function scanStore(inputUrl: string, opts: CommerceScanOptions = {}): Promise<ScanResult> {
  const errors: string[] = [];
  const normalizedUrl = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

  const toolPage = await fetchUrl(normalizedUrl);
  let page = toolPage;
  let headers: Record<string, string> | undefined;
  let browserStatus: number | null = null;
  if (!toolPage.ok) {
    const browserPage = await fetchUrl(normalizedUrl, BROWSER_HEADERS);
    browserStatus = browserPage.status;
    if (browserPage.ok) {
      page = browserPage;
      headers = BROWSER_HEADERS;
    }
  }
  if (!page.ok) errors.push(`Failed to fetch ${normalizedUrl}: ${page.error ?? `HTTP ${page.status}`}`);
  const home = snapshot(page.finalUrl, page.body ?? "");

  const robotsRes = await fetchUrl(joinPath(page.finalUrl, "/robots.txt"), headers);
  const robotsOk = robotsRes.ok && !looksLikeHtmlDocument(robotsRes.body);

  const wellKnown: Record<string, WellKnownProbe> = {};
  const fetchText = async (path: string): Promise<WellKnownProbe> => {
    const cached = wellKnown[path];
    if (cached) return cached;
    const res = await fetchUrl(joinPath(page.finalUrl, path), headers);
    const softNotFound = res.ok && looksLikeHtmlDocument(res.body);
    const probe: WellKnownProbe = {
      path,
      status: res.status,
      ok: res.ok && !softNotFound,
      contentType: res.headers["content-type"],
      body: res.body ?? undefined,
      error: softNotFound ? "returned an HTML page instead of the expected file (soft 404)" : res.error,
    };
    wellKnown[path] = probe;
    return probe;
  };

  const ctx: CommerceContext = {
    inputUrl: normalizedUrl,
    finalUrl: page.finalUrl,
    statusCode: page.status ?? 0,
    home,
    product: home,
    productSource: "homepage-fallback",
    access: { toolStatus: toolPage.status, browserStatus, usedBrowserFallback: headers !== undefined },
    headers: page.headers,
    robotsTxt: { fetched: robotsOk, body: robotsOk ? robotsRes.body : null },
    wellKnown,
    fetchText,
  };

  const metrics: Record<string, number> = {};
  const maxSamples = opts.maxProductSamples ?? 3;

  if (opts.productUrl) {
    const res = await fetchUrl(opts.productUrl, headers);
    if (res.ok && res.body) {
      ctx.product = snapshot(res.finalUrl, res.body);
      ctx.productSource = "user";
    } else {
      errors.push(`Failed to fetch --product-url ${opts.productUrl}: ${res.error ?? res.status}`);
    }
  } else if (hasProduct(home)) {
    ctx.productSource = "input";
  } else {
    // Sitemap product entries are the most reliable, then ranked links from the home page.
    const fromSitemap = await productLinksFromSitemap(fetchText, headers);
    // Sitemap product entries and strong URL shapes are trusted as product pages even without markup
    // (a product page with no structured data is exactly what we want to report). Heuristic links
    // must prove themselves with Product markup or og:type=product, otherwise we'd grade a category page.
    const fromLinks = productLinksFromPage(home);
    const trusted = new Set([...fromSitemap.slice(0, 2), ...fromLinks.filter((l) => isStrongProductUrl(new URL(l)))]);
    const candidates = [...new Set([...fromSitemap.slice(0, 2), ...fromLinks])];
    const validPages: PageSnapshot[] = [];
    for (const url of candidates.slice(0, MAX_PRODUCT_CANDIDATES)) {
      if (validPages.length >= maxSamples) break;
      const res = await fetchUrl(url, headers);
      if (!res.ok || !res.body || !(res.headers["content-type"] ?? "").includes("html")) continue;
      const snap = snapshot(res.finalUrl, res.body);
      // Only accept a page that declares itself a product (JSON-LD, microdata or og:type);
      // otherwise product-data results would describe a category page.
      if (hasProduct(snap) || isOgProduct(snap) || trusted.has(url)) validPages.push(snap);
    }

    if (validPages.length === 1) {
      ctx.product = validPages[0]!;
      ctx.productSource = "discovered";
    } else if (validPages.length > 1) {
      // Different product pages on the same store can score very differently (one merchant fills
      // in returns/shipping on their bestseller and nowhere else). Sample a few and report the
      // median instead of whichever page discovery happened to try first.
      const scored = await Promise.all(
        validPages.map(async (p) => ({ page: p, score: await scoreProductPage({ ...ctx, product: p, productSource: "discovered" }) })),
      );
      scored.sort((a, b) => a.score - b.score);
      const median = scored[medianIndex(scored.length)]!;
      ctx.product = median.page;
      ctx.productSource = "discovered";
      metrics.productPagesSampled = scored.length;
      metrics.productDataScoreMin = scored[0]!.score;
      metrics.productDataScoreMedian = median.score;
      metrics.productDataScoreMax = scored[scored.length - 1]!.score;
    }
  }

  const platform = detectPlatform([home, ctx.product], page.headers);

  const result = await runRules({
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    scanner: "shop",
    target: { kind: "store", input: inputUrl, resolved: page.finalUrl, labels: { platform: platform.platform } },
    categories: COMMERCE_CATEGORIES,
    // When the store refuses both a bot and a browser there is nothing meaningful to check;
    // report only the reachability failure instead of cascading dozens of misleading "missing" findings.
    rules: page.ok ? ALL_RULES : ALL_RULES.filter((r) => r.id === "agent-access.reachable"),
    ctx,
    errors,
    metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
  });

  // Swap in a platform-specific recipe where we have one; the generic fix stays otherwise.
  for (const finding of result.findings) {
    if (finding.status !== "fail" && finding.status !== "warn") continue;
    const fix = platformFix(finding.id, platform.platform);
    if (fix) finding.fixSuggestion = fix;
  }

  return result;
}

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

/** Parse every <script type="application/ld+json"> block, flattening @graph arrays. Bad JSON is skipped, not thrown. */
export function extractJsonLd($: CheerioAPI): unknown[] {
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && "@graph" in item && Array.isArray((item as any)["@graph"])) {
          blocks.push(...(item as any)["@graph"]);
        } else {
          blocks.push(item);
        }
      }
    } catch {
      // malformed JSON-LD is itself a finding, surfaced by the product-data rules — not fatal here.
    }
  });
  return blocks;
}

/** "Product", "schema:Product" and "https://schema.org/Product" all name the same type. */
function typeMatches(t: unknown, type: string): boolean {
  const names = Array.isArray(t) ? t : [t];
  return names.some((n) => typeof n === "string" && n.replace(/^.*[/:#]/, "") === type);
}

/** Links to other entities, not parts of this one: descending into them would count related products as the page's own. */
const SKIP_KEYS = new Set(["isRelatedTo", "isSimilarTo", "isAccessoryOrSparePartFor", "isConsumableFor", "isVariantOf"]);

/**
 * Every node of the given @type anywhere in the JSON-LD, including nested ones
 * (ProductGroup.hasVariant, Offer.itemOffered, ...) and multi-typed nodes (@type: ["Product", "X"]).
 */
export function findByType(jsonLd: unknown[], type: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeMatches(obj["@type"], type)) found.push(obj);
    for (const [key, value] of Object.entries(obj)) {
      if (!SKIP_KEYS.has(key)) walk(value);
    }
  };
  walk(jsonLd);
  return found;
}

/** ProductGroup fields that describe the group itself and must not be copied onto its variants. */
const GROUP_ONLY_KEYS = new Set(["@type", "@id", "@context", "hasVariant", "variesBy", "productGroupID"]);

/**
 * Product entities a merchant exposes on the page. Variants of a ProductGroup inherit the group's
 * shared fields (brand, image, offers, ...) unless they set their own, the way schema.org intends;
 * a ProductGroup with no Product variants counts as the product itself.
 */
export function findProducts(jsonLd: unknown[]): Record<string, unknown>[] {
  const groups = findByType(jsonLd, "ProductGroup");
  const inherited = new Map<Record<string, unknown>, Record<string, unknown>>();
  const products: Record<string, unknown>[] = [];
  for (const group of groups) {
    const variants = findByType([group.hasVariant], "Product").filter((v) => v !== group);
    if (variants.length === 0 && !typeMatches(group["@type"], "Product")) products.push(group);
    const shared = Object.fromEntries(Object.entries(group).filter(([k]) => !GROUP_ONLY_KEYS.has(k)));
    for (const v of variants) if (!inherited.has(v)) inherited.set(v, { ...shared, ...v });
  }
  for (const p of findByType(jsonLd, "Product")) products.push(inherited.get(p) ?? p);
  return products;
}

/** Rough heuristic for "does this page render meaningful content without executing JS". */
export function visibleTextLength($: CheerioAPI): number {
  const clone = $.root().clone();
  clone.find("script, style, noscript").remove();
  return clone.text().replace(/\s+/g, " ").trim().length;
}

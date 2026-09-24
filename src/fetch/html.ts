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

export function findByType(jsonLd: unknown[], type: string): Record<string, unknown>[] {
  return jsonLd.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== "object") return false;
    const t = (item as Record<string, unknown>)["@type"];
    if (typeof t === "string") return t === type;
    if (Array.isArray(t)) return t.includes(type);
    return false;
  });
}

/** Rough heuristic for "does this page render meaningful content without executing JS". */
export function visibleTextLength($: CheerioAPI): number {
  const clone = $.root().clone();
  clone.find("script, style, noscript").remove();
  return clone.text().replace(/\s+/g, " ").trim().length;
}

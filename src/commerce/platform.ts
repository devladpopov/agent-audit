import type { PageSnapshot } from "./types.js";

/**
 * Platforms the store checker knows fix recipes for. "other" covers everything else
 * (Shopify, BigCommerce, Salesforce Commerce Cloud, bespoke stacks, ...).
 */
export type Platform = "woocommerce" | "magento" | "prestashop" | "opencart" | "shopify" | "other";

interface Signal {
  platform: Platform;
  test: (page: PageSnapshot, headers: Record<string, string>) => boolean;
  evidence: string;
}

const SIGNALS: Signal[] = [
  // Shopify goes first: its inline JS can mention generic markers other platforms are matched on
  // (e.g. "form_key"), which made Shopify stores show up as Magento in the 100-store run.
  {
    platform: "shopify",
    test: (p, h) =>
      /shopify/i.test(h["powered-by"] ?? "") ||
      "x-shopid" in h ||
      "x-shopify-stage" in h ||
      /cdn\.shopify\.com/i.test(p.html) ||
      /Shopify\.theme\b/.test(p.html),
    evidence: "Powered-By: Shopify / X-ShopId header, cdn.shopify.com asset or Shopify.theme in the page",
  },
  {
    platform: "woocommerce",
    test: (p) => /woocommerce/i.test(p.html) && /wp-content/i.test(p.html),
    evidence: '"woocommerce" and "wp-content" in the page',
  },
  {
    platform: "magento",
    test: (p, h) =>
      Object.keys(h).some((k) => k.startsWith("x-magento-")) ||
      /name=["']form_key["']/.test(p.html) ||
      /Mage\.Cookies|text\/x-magento-init|data-mage-init/.test(p.html),
    evidence: "X-Magento-* header, a form_key form field, Mage.Cookies or x-magento-init in the page",
  },
  {
    platform: "prestashop",
    test: (p) => /prestashop/i.test(p.html) || /\bid_product\b/.test(p.html),
    evidence: '"prestashop" or "id_product" in the page',
  },
  {
    platform: "opencart",
    test: (p) => /catalog\/view\/theme/i.test(p.html) || /route=product\/product/i.test(p.html),
    evidence: '"catalog/view/theme" or "route=product/product" in the page',
  },
];

export interface PlatformDetection {
  platform: Platform;
  evidence?: string;
}

/**
 * Best-effort fingerprint from one or more pages (home page, and ideally a product page too —
 * some CDNs/caches strip plugin markers like "woocommerce" from the cached home page but not from
 * product pages) plus response headers. Never throws.
 */
export function detectPlatform(pages: PageSnapshot[], headers: Record<string, string>): PlatformDetection {
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  for (const signal of SIGNALS) {
    for (const page of pages) {
      try {
        if (signal.test(page, lowerHeaders)) return { platform: signal.platform, evidence: signal.evidence };
      } catch {
        // a signal misfiring must never break the scan
      }
    }
  }
  return { platform: "other" };
}

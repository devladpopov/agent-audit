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
  {
    platform: "woocommerce",
    test: (p) => /woocommerce/i.test(p.html) && /wp-content/i.test(p.html),
    evidence: '"woocommerce" and "wp-content" in the page',
  },
  {
    platform: "magento",
    test: (p, h) => "x-magento-varnish-pool" in h || /form_key/.test(p.html) || /Mage\.Cookies/.test(p.html),
    evidence: "X-Magento-* header, form_key or Mage.Cookies in the page",
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
  {
    platform: "shopify",
    test: (p, h) => /cdn\.shopify\.com/i.test(p.html) || "x-shopid" in h,
    evidence: "cdn.shopify.com asset or X-ShopId header",
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

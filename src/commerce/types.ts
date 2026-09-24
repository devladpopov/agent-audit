import type { CheerioAPI } from "cheerio";
import type { CategoryDef, Rule } from "../core/types.js";

export const COMMERCE_CATEGORIES: CategoryDef[] = [
  { id: "product-data", label: "Product data", weight: 1 },
  { id: "feeds", label: "Feeds", weight: 1 },
  { id: "protocol-endpoints", label: "Protocol endpoints (UCP/ACP/AP2)", weight: 1 },
  { id: "agent-access", label: "Agent access", weight: 1 },
  { id: "checkout-readiness", label: "Checkout readiness", weight: 1 },
  { id: "trust-signals", label: "Trust signals", weight: 1 },
];

export interface WellKnownProbe {
  path: string;
  status: number | null;
  ok: boolean;
  contentType?: string;
  body?: string;
  error?: string;
}

export interface PageSnapshot {
  url: string;
  html: string;
  $: CheerioAPI;
  jsonLd: unknown[];
}

export interface CommerceContext {
  inputUrl: string;
  finalUrl: string;
  statusCode: number;
  /** The page the user pointed us at (usually the homepage). */
  home: PageSnapshot;
  /**
   * Page used for product-data checks: the input page if it already has Product JSON-LD,
   * a product page discovered from links/sitemap, or the home page as a last resort.
   */
  product: PageSnapshot;
  productSource: "input" | "user" | "discovered" | "homepage-fallback";
  /**
   * How the store answered an identified automated client versus a plain browser. When only the
   * browser got through, the rest of the scan uses browser headers so other checks still mean something.
   */
  access: { toolStatus: number | null; browserStatus: number | null; usedBrowserFallback: boolean };
  headers: Record<string, string>;
  robotsTxt: { fetched: boolean; body: string | null };
  wellKnown: Record<string, WellKnownProbe>;
  fetchText: (path: string) => Promise<WellKnownProbe>;
}

export type CommerceRule = Rule<CommerceContext>;

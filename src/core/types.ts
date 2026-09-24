import type { CheerioAPI } from "cheerio";

/**
 * Core types shared by every rule-based scanner in this project family
 * (this commerce checker today, the planned MCP Trust Scanner next).
 * Keep this file free of commerce-specific concepts so it stays reusable.
 */

export type Category =
  | "product-data"
  | "feeds"
  | "protocol-endpoints"
  | "agent-access"
  | "checkout-readiness"
  | "trust-signals";

export const CATEGORIES: readonly Category[] = [
  "product-data",
  "feeds",
  "protocol-endpoints",
  "agent-access",
  "checkout-readiness",
  "trust-signals",
] as const;

export type Status = "pass" | "warn" | "fail" | "info" | "skip";

export interface WellKnownProbe {
  path: string;
  status: number | null;
  ok: boolean;
  contentType?: string;
  body?: string;
  error?: string;
}

/** Everything a rule is allowed to look at. Built once per scan, reused by all rules. */
export interface RuleContext {
  inputUrl: string;
  finalUrl: string;
  statusCode: number;
  html: string;
  $: CheerioAPI;
  headers: Record<string, string>;
  jsonLd: unknown[];
  robotsTxt: { fetched: boolean; body: string | null };
  wellKnown: Record<string, WellKnownProbe>;
  fetchText: (path: string) => Promise<WellKnownProbe>;
}

export interface RuleOutcome {
  status: Status;
  message: string;
  detail?: string;
  evidence?: string;
  fixSuggestion?: string;
}

export interface Rule {
  id: string;
  category: Category;
  title: string;
  /** Relative weight within its category. Categories are then combined per ScoringConfig. */
  weight: number;
  specUrl?: string;
  check: (ctx: RuleContext) => Promise<RuleOutcome> | RuleOutcome;
}

export interface Finding extends RuleOutcome {
  id: string;
  category: Category;
  title: string;
  weight: number;
  specUrl?: string;
}

export interface CategoryScore {
  category: Category;
  score: number; // 0-100
  weight: number; // this category's share of the overall score
  findings: Finding[];
}

export interface ScanResult {
  tool: string;
  toolVersion: string;
  scannedAt: string;
  inputUrl: string;
  finalUrl: string;
  overallScore: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  categories: CategoryScore[];
  findings: Finding[];
  errors: string[];
}

/**
 * Core types shared by every scanner in the series (commerce readiness today, MCP Trust Scanner next).
 * Nothing in src/core may import from a specific scanner (src/commerce, src/mcp).
 */

export type Status = "pass" | "warn" | "fail" | "info" | "skip";

/** Impact of a failed check. Commerce rules mostly use medium/low; security scanners need the full range. */
export type Severity = "critical" | "high" | "medium" | "low";

/** Where a finding points in a source file (1-based). Used by file-oriented scanners (text linter, MCP code checks). */
export interface SourceLocation {
  file?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface RuleOutcome {
  status: Status;
  message: string;
  detail?: string;
  evidence?: string;
  fixSuggestion?: string;
  location?: SourceLocation;
  /** Overrides the rule's default severity for this particular outcome. */
  severity?: Severity;
}

export interface Rule<Ctx> {
  id: string;
  category: string;
  title: string;
  /** Relative weight within its category. */
  weight: number;
  severity?: Severity;
  specUrl?: string;
  check: (ctx: Ctx) => Promise<RuleOutcome> | RuleOutcome;
}

export interface Finding extends RuleOutcome {
  id: string;
  category: string;
  title: string;
  weight: number;
  specUrl?: string;
}

export interface CategoryDef {
  id: string;
  label: string;
  /** Share of the overall score. */
  weight: number;
}

export interface CategoryScore {
  category: string;
  label: string;
  /** 0-100, or null when nothing in the category could be measured ("not assessed"). */
  score: number | null;
  weight: number;
  findings: Finding[];
}

export interface ScanTarget {
  /** e.g. "store", "mcp-server" */
  kind: string;
  input: string;
  resolved: string;
  /** Free-form scanner-specific tags, e.g. { platform: "woocommerce" }. Shown in reports, kept out of scoring. */
  labels?: Record<string, string>;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ScanResult {
  tool: string;
  toolVersion: string;
  scanner: string;
  scannedAt: string;
  target: ScanTarget;
  overallScore: number;
  grade: Grade;
  categories: CategoryScore[];
  findings: Finding[];
  /** Scanner-specific numbers shown next to the score, e.g. cliches per 1,000 words. */
  metrics?: Record<string, number>;
  errors: string[];
}

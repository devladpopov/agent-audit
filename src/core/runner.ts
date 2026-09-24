import { scoreCategory, scoreOverall } from "./scorer.js";
import type { CategoryDef, Finding, Rule, ScanResult, ScanTarget } from "./types.js";

export interface RunOptions<Ctx> {
  tool: string;
  toolVersion: string;
  scanner: string;
  target: ScanTarget;
  categories: CategoryDef[];
  rules: Rule<Ctx>[];
  ctx: Ctx;
  errors?: string[];
  metrics?: Record<string, number>;
}

/**
 * Runs rules sequentially (some rules read state cached by earlier ones), turns thrown errors
 * into "skip" findings, and scores the result. Shared by every scanner in the series.
 */
export async function runRules<Ctx>(opts: RunOptions<Ctx>): Promise<ScanResult> {
  const errors = [...(opts.errors ?? [])];
  const findings: Finding[] = [];

  for (const rule of opts.rules) {
    const base = {
      id: rule.id,
      category: rule.category,
      title: rule.title,
      weight: rule.weight,
      specUrl: rule.specUrl,
      severity: rule.severity,
    };
    try {
      const outcome = await rule.check(opts.ctx);
      findings.push({ ...base, ...outcome, severity: outcome.severity ?? rule.severity });
    } catch (err) {
      errors.push(`Rule ${rule.id} threw: ${err instanceof Error ? err.message : String(err)}`);
      findings.push({ ...base, status: "skip", message: "Rule failed to execute." });
    }
  }

  const categories = opts.categories.map((def) =>
    scoreCategory(
      def,
      findings.filter((f) => f.category === def.id),
    ),
  );
  const { overallScore, grade } = scoreOverall(categories);

  return {
    tool: opts.tool,
    toolVersion: opts.toolVersion,
    scanner: opts.scanner,
    scannedAt: new Date().toISOString(),
    target: opts.target,
    overallScore,
    grade,
    categories,
    findings,
    ...(opts.metrics ? { metrics: opts.metrics } : {}),
    errors,
  };
}

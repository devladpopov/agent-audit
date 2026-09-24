import type { CategoryDef, CategoryScore, Finding, Grade, Status } from "./types.js";

/** How much each status counts toward a category's score. info and skip are excluded entirely. */
const STATUS_CREDIT: Record<Status, number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  info: 0,
  skip: 0,
};

export function scoreCategory(def: CategoryDef, findings: Finding[]): CategoryScore {
  const scored = findings.filter((f) => f.status !== "info" && f.status !== "skip");
  const totalWeight = scored.reduce((sum, f) => sum + f.weight, 0);
  const earned = scored.reduce((sum, f) => sum + f.weight * STATUS_CREDIT[f.status], 0);
  // Nothing measurable means "not assessed", not "perfect": a category made only of info findings
  // used to score 100 and inflate the overall score.
  const score = totalWeight === 0 ? null : Math.round((earned / totalWeight) * 100);
  return { category: def.id, label: def.label, score, weight: def.weight, findings };
}

/** Weighted average over assessed categories only. */
export function scoreOverall(categories: CategoryScore[]): { overallScore: number; grade: Grade } {
  const assessed = categories.filter((c) => c.score !== null);
  const totalWeight = assessed.reduce((sum, c) => sum + c.weight, 0);
  const weighted = assessed.reduce((sum, c) => sum + (c.score ?? 0) * c.weight, 0);
  const overallScore = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
  return { overallScore, grade: toGrade(overallScore) };
}

export function toGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

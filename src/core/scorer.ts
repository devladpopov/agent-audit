import type { CategoryScore, Finding, Status } from "./types.js";
import { CATEGORIES, type Category } from "./types.js";

/** How much each status counts toward a category's score. */
const STATUS_CREDIT: Record<Status, number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  info: 0, // informational, excluded from denominator too (see scoreCategory)
  skip: 0, // excluded from denominator
};

/** Default equal weighting across categories; callers (CLI/web) can override. */
export const DEFAULT_CATEGORY_WEIGHTS: Record<Category, number> = Object.fromEntries(
  CATEGORIES.map((c) => [c, 1]),
) as Record<Category, number>;

export function scoreCategory(category: Category, findings: Finding[], weight: number): CategoryScore {
  const scored = findings.filter((f) => f.status !== "info" && f.status !== "skip");
  const totalWeight = scored.reduce((sum, f) => sum + f.weight, 0);
  const earned = scored.reduce((sum, f) => sum + f.weight * STATUS_CREDIT[f.status], 0);
  const score = totalWeight === 0 ? 100 : Math.round((earned / totalWeight) * 100);
  return { category, score, weight, findings };
}

export function scoreOverall(
  categories: CategoryScore[],
): { overallScore: number; grade: "A" | "B" | "C" | "D" | "F" } {
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const weighted = categories.reduce((sum, c) => sum + c.score * c.weight, 0);
  const overallScore = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
  return { overallScore, grade: toGrade(overallScore) };
}

export function toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

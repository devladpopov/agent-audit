import { describe, expect, test } from "bun:test";
import { scoreCategory, scoreOverall, toGrade } from "../src/core/scorer.js";
import type { CategoryDef, Finding } from "../src/core/types.js";

const def = (id: string, weight = 1): CategoryDef => ({ id, label: id, weight });

function finding(overrides: Partial<Finding>): Finding {
  return { id: "x", category: "c", title: "x", weight: 1, status: "pass", message: "", ...overrides };
}

describe("scoreCategory", () => {
  test("all pass -> 100", () => {
    expect(scoreCategory(def("c"), [finding({}), finding({})]).score).toBe(100);
  });

  test("all fail -> 0", () => {
    expect(scoreCategory(def("c"), [finding({ status: "fail" })]).score).toBe(0);
  });

  test("warn counts as half credit", () => {
    expect(scoreCategory(def("c"), [finding({ status: "warn" })]).score).toBe(50);
  });

  test("info and skip are excluded from the denominator", () => {
    const f = [finding({}), finding({ status: "info" }), finding({ status: "skip" })];
    expect(scoreCategory(def("c"), f).score).toBe(100);
  });

  test("nothing measurable -> null (not assessed), not a free 100", () => {
    expect(scoreCategory(def("c"), [finding({ status: "info" })]).score).toBeNull();
  });

  test("weights are respected", () => {
    const f = [finding({ weight: 3 }), finding({ status: "fail", weight: 1 })];
    expect(scoreCategory(def("c"), f).score).toBe(75);
  });
});

describe("scoreOverall", () => {
  test("averages category scores by weight", () => {
    const cats = [scoreCategory(def("a", 2), [finding({})]), scoreCategory(def("b", 1), [finding({ status: "fail" })])];
    expect(scoreOverall(cats).overallScore).toBe(67);
  });

  test("not-assessed categories are left out of the average", () => {
    const cats = [scoreCategory(def("a"), [finding({ status: "fail" })]), scoreCategory(def("b"), [finding({ status: "info" })])];
    expect(scoreOverall(cats).overallScore).toBe(0);
  });
});

describe("toGrade", () => {
  test.each([
    [95, "A"],
    [80, "B"],
    [65, "C"],
    [45, "D"],
    [10, "F"],
  ])("%i -> %s", (score, grade) => {
    expect(toGrade(score)).toBe(grade);
  });
});

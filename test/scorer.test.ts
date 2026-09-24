import { describe, expect, test } from "bun:test";
import { scoreCategory, scoreOverall, toGrade } from "../src/core/scorer.js";
import type { Finding } from "../src/core/types.js";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "x",
    category: "trust-signals",
    title: "x",
    weight: 1,
    status: "pass",
    message: "",
    ...overrides,
  };
}

describe("scoreCategory", () => {
  test("all pass -> 100", () => {
    const cat = scoreCategory("trust-signals", [finding({ status: "pass" }), finding({ status: "pass" })], 1);
    expect(cat.score).toBe(100);
  });

  test("all fail -> 0", () => {
    const cat = scoreCategory("trust-signals", [finding({ status: "fail" })], 1);
    expect(cat.score).toBe(0);
  });

  test("warn counts as half credit", () => {
    const cat = scoreCategory("trust-signals", [finding({ status: "warn" })], 1);
    expect(cat.score).toBe(50);
  });

  test("info and skip are excluded from the denominator", () => {
    const cat = scoreCategory(
      "trust-signals",
      [finding({ status: "pass" }), finding({ status: "info" }), finding({ status: "skip" })],
      1,
    );
    expect(cat.score).toBe(100);
  });

  test("no scoreable findings defaults to 100 (nothing to penalize)", () => {
    const cat = scoreCategory("trust-signals", [finding({ status: "info" })], 1);
    expect(cat.score).toBe(100);
  });

  test("weights are respected", () => {
    const cat = scoreCategory(
      "trust-signals",
      [finding({ status: "pass", weight: 3 }), finding({ status: "fail", weight: 1 })],
      1,
    );
    expect(cat.score).toBe(75);
  });
});

describe("scoreOverall", () => {
  test("averages category scores by weight", () => {
    const categories = [
      scoreCategory("trust-signals", [finding({ status: "pass" })], 2),
      scoreCategory("feeds", [finding({ status: "fail" })], 1),
    ];
    const { overallScore } = scoreOverall(categories);
    // (100*2 + 0*1) / 3 = 66.67 -> rounds to 67
    expect(overallScore).toBe(67);
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

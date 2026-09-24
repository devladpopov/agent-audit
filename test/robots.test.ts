import { describe, expect, test } from "bun:test";
import { isFullyBlocked, parseRobots } from "../src/fetch/robots.js";

describe("parseRobots + isFullyBlocked", () => {
  test("wildcard disallow-all blocks everything", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /\n");
    expect(isFullyBlocked(groups, "GPTBot")).toBe(true);
  });

  test("specific agent block overrides an otherwise-open wildcard", () => {
    const groups = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: GPTBot\nDisallow: /\n");
    expect(isFullyBlocked(groups, "GPTBot")).toBe(true);
    expect(isFullyBlocked(groups, "ClaudeBot")).toBe(false);
  });

  test("specific agent allow overrides a wildcard disallow-all", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow:\n");
    expect(isFullyBlocked(groups, "PerplexityBot")).toBe(false);
    expect(isFullyBlocked(groups, "GPTBot")).toBe(true);
  });

  test("scoped disallow does not count as fully blocked", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /admin\n");
    expect(isFullyBlocked(groups, "GPTBot")).toBe(false);
  });

  test("no robots rules at all -> not blocked", () => {
    expect(isFullyBlocked([], "GPTBot")).toBe(false);
  });
});

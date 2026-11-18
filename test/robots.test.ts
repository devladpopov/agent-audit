import { describe, expect, test } from "bun:test";
import { isFullyBlocked, isPathAllowed, parseContentSignals, parseRobots } from "../src/commerce/fetch/robots.js";

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

  test("consecutive User-agent lines share one rule set", () => {
    const groups = parseRobots("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n");
    expect(isFullyBlocked(groups, "GPTBot")).toBe(true);
    expect(isFullyBlocked(groups, "ClaudeBot")).toBe(true);
    expect(isFullyBlocked(groups, "ChatGPT-User")).toBe(false);
  });
});

describe("isPathAllowed", () => {
  test("prefix disallow blocks matching paths only", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /products/\n");
    expect(isPathAllowed(groups, "ChatGPT-User", "/products/shoe")).toBe(false);
    expect(isPathAllowed(groups, "ChatGPT-User", "/collections/all")).toBe(true);
  });

  test("longest match wins, Allow wins a tie", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /\nAllow: /products/\n");
    expect(isPathAllowed(groups, "OAI-SearchBot", "/products/shoe")).toBe(true);
    expect(isPathAllowed(groups, "OAI-SearchBot", "/cart")).toBe(false);
    const tie = parseRobots("User-agent: *\nDisallow: /p\nAllow: /p\n");
    expect(isPathAllowed(tie, "OAI-SearchBot", "/p/1")).toBe(true);
  });

  test("wildcards and end anchors", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /*?variant=\nDisallow: /*.json$\n");
    expect(isPathAllowed(groups, "Claude-User", "/products/a?variant=2")).toBe(false);
    expect(isPathAllowed(groups, "Claude-User", "/products/a.json")).toBe(false);
    expect(isPathAllowed(groups, "Claude-User", "/products/a.json?x=1")).toBe(true);
  });

  test("empty Disallow allows everything", () => {
    expect(isPathAllowed(parseRobots("User-agent: *\nDisallow:\n"), "GPTBot", "/")).toBe(true);
  });
});

describe("parseContentSignals", () => {
  test("reads and merges Content-Signal values", () => {
    const body = "User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\nContent-signal: ai-input=yes # live answers ok\n";
    const signals = parseContentSignals(body);
    expect(signals.lines).toHaveLength(2);
    expect(signals.values).toEqual({ search: "yes", "ai-train": "no", "ai-input": "yes" });
  });

  test("no Content-Signal lines -> empty", () => {
    expect(parseContentSignals("User-agent: *\nDisallow:\n").lines).toHaveLength(0);
  });
});

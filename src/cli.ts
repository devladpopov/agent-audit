#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { runScan } from "./engine.js";
import { toJson, toMarkdown, toText } from "./core/report.js";
import { toSvgBadge } from "./core/badge.js";

const program = new Command();

program
  .name("agent-audit")
  .description("Score a storefront's readiness for AI shopping agents (UCP/ACP/AP2, structured data, feeds, access, checkout, trust).")
  .version("0.1.0");

program
  .command("scan <url>")
  .description("Scan a store URL and print a readiness report")
  .option("--json", "Output machine-readable JSON instead of text")
  .option("--markdown", "Output a Markdown report (e.g. for a PR comment)")
  .option("--badge <path>", "Write an SVG score badge to this path")
  .option("--out <path>", "Write the report to this path instead of stdout")
  .option("--min-score <n>", "Exit non-zero if the overall score is below this threshold (for CI gating)", parseInt10)
  .action(async (url: string, opts) => {
    const result = await runScan(url);

    const rendered = opts.json ? toJson(result) : opts.markdown ? toMarkdown(result) : toText(result);
    if (opts.out) {
      writeFileSync(opts.out, rendered, "utf8");
    } else {
      console.log(rendered);
    }

    if (opts.badge) {
      writeFileSync(opts.badge, toSvgBadge("agent readiness", result.overallScore), "utf8");
    }

    if (result.errors.length > 0 && !opts.json) {
      console.error(`\n${result.errors.length} error(s) occurred during the scan — see above.`);
    }

    if (typeof opts.minScore === "number" && result.overallScore < opts.minScore) {
      console.error(`Score ${result.overallScore} is below the required minimum of ${opts.minScore}.`);
      process.exitCode = 1;
    }
  });

function parseInt10(v: string): number {
  return Number.parseInt(v, 10);
}

program.parseAsync(process.argv);

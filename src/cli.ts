#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { scanStore, TOOL_VERSION } from "./commerce/engine.js";
import { toJson, toMarkdown, toText } from "./core/report.js";
import { toSvgBadge } from "./core/badge.js";
import type { ScanResult } from "./core/types.js";

interface OutputOptions {
  json?: boolean;
  markdown?: boolean;
  badge?: string;
  out?: string;
  minScore?: number;
}

/** Shared output handling for every scanner subcommand (shop today, mcp next). */
function emit(result: ScanResult, opts: OutputOptions, badgeLabel: string): void {
  const rendered = opts.json ? toJson(result) : opts.markdown ? toMarkdown(result) : toText(result);
  if (opts.out) writeFileSync(opts.out, rendered, "utf8");
  else console.log(rendered);

  if (opts.badge) writeFileSync(opts.badge, toSvgBadge(badgeLabel, result.overallScore), "utf8");

  if (result.errors.length > 0 && !opts.json) {
    console.error(`\n${result.errors.length} error(s) occurred during the scan, see above.`);
  }
  if (typeof opts.minScore === "number" && result.overallScore < opts.minScore) {
    console.error(`Score ${result.overallScore} is below the required minimum of ${opts.minScore}.`);
    process.exitCode = 1;
  }
}

function withOutputOptions(cmd: Command): Command {
  return cmd
    .option("--json", "Output machine-readable JSON instead of text")
    .option("--markdown", "Output a Markdown report (e.g. for a PR comment)")
    .option("--badge <path>", "Write an SVG score badge to this path")
    .option("--out <path>", "Write the report to this path instead of stdout")
    .option("--min-score <n>", "Exit non-zero if the overall score is below this threshold (CI gate)", (v) =>
      Number.parseInt(v, 10),
    );
}

const program = new Command();
program
  .name("agent-audit")
  .description("Open-source audits for the agent ecosystem.")
  .version(TOOL_VERSION);

const shopAction = async (url: string, opts: OutputOptions & { productUrl?: string }) => {
  const result = await scanStore(url, { productUrl: opts.productUrl });
  emit(result, opts, "agent readiness");
};

withOutputOptions(
  program
    .command("shop <url>")
    .description("Score a storefront's readiness for AI shopping agents (UCP/ACP/AP2, product data, feeds, access, trust)")
    .option("--product-url <url>", "Product page to use for product-data checks (default: auto-discover)"),
).action(shopAction);

// Backwards-compatible alias from the first scaffold.
withOutputOptions(
  program
    .command("scan <url>", { hidden: true })
    .option("--product-url <url>", "Product page to use for product-data checks"),
).action(shopAction);

program.parseAsync(process.argv);

import type { ScanResult, Status } from "./types.js";

const STATUS_ICON: Record<Status, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  info: "ℹ️",
  skip: "⏭️",
};

export function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Human-readable terminal/CI report. Kept dependency-free so it also works inside a GitHub Action log. */
export function toText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`${result.tool} v${result.toolVersion} — ${result.finalUrl}`);
  lines.push(`Overall score: ${result.overallScore}/100 (grade ${result.grade})`);
  lines.push("");
  for (const cat of result.categories) {
    lines.push(`${cat.category} — ${cat.score}/100`);
    for (const f of cat.findings) {
      lines.push(`  ${STATUS_ICON[f.status]} [${f.status}] ${f.title}: ${f.message}`);
      if (f.fixSuggestion) lines.push(`     fix: ${f.fixSuggestion}`);
      if (f.specUrl) lines.push(`     spec: ${f.specUrl}`);
    }
    lines.push("");
  }
  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const e of result.errors) lines.push(`  - ${e}`);
  }
  return lines.join("\n");
}

/** Markdown report, suitable for a PR comment (GitHub Action) or the web report page. */
export function toMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`## ${result.tool} report for ${result.finalUrl}`);
  lines.push("");
  lines.push(`**Overall score: ${result.overallScore}/100 (grade ${result.grade})**`);
  lines.push("");
  lines.push("| Category | Score |");
  lines.push("|---|---|");
  for (const cat of result.categories) {
    lines.push(`| ${cat.category} | ${cat.score}/100 |`);
  }
  lines.push("");
  for (const cat of result.categories) {
    lines.push(`### ${cat.category}`);
    for (const f of cat.findings) {
      lines.push(`- ${STATUS_ICON[f.status]} **${f.title}** — ${f.message}`);
      if (f.fixSuggestion) lines.push(`  - Fix: ${f.fixSuggestion}`);
      if (f.specUrl) lines.push(`  - Spec: ${f.specUrl}`);
    }
  }
  return lines.join("\n");
}

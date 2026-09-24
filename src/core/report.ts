import type { ScanResult, Status } from "./types.js";

const STATUS_ICON: Record<Status, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  info: "ℹ️",
  skip: "⏭️",
};

function scoreText(score: number | null): string {
  return score === null ? "not assessed" : `${score}/100`;
}

export function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Human-readable terminal/CI report. Kept dependency-free so it also works inside a GitHub Action log. */
export function toText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`${result.tool} ${result.scanner} v${result.toolVersion}: ${result.target.resolved}`);
  lines.push(`Overall score: ${result.overallScore}/100 (grade ${result.grade})`);
  lines.push("");
  for (const cat of result.categories) {
    lines.push(`${cat.label}: ${scoreText(cat.score)}`);
    for (const f of cat.findings) {
      const sev = f.severity && (f.status === "fail" || f.status === "warn") ? ` ${f.severity}` : "";
      lines.push(`  ${STATUS_ICON[f.status]} [${f.status}${sev}] ${f.title}: ${f.message}`);
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
  lines.push(`## ${result.tool} ${result.scanner} report for ${result.target.resolved}`);
  lines.push("");
  lines.push(`**Overall score: ${result.overallScore}/100 (grade ${result.grade})**`);
  lines.push("");
  lines.push("| Category | Score |");
  lines.push("|---|---|");
  for (const cat of result.categories) {
    lines.push(`| ${cat.label} | ${scoreText(cat.score)} |`);
  }
  lines.push("");
  for (const cat of result.categories) {
    lines.push(`### ${cat.label}`);
    for (const f of cat.findings) {
      lines.push(`- ${STATUS_ICON[f.status]} **${f.title}**: ${f.message}`);
      if (f.fixSuggestion) lines.push(`  - Fix: ${f.fixSuggestion}`);
      if (f.specUrl) lines.push(`  - Spec: ${f.specUrl}`);
    }
  }
  return lines.join("\n");
}

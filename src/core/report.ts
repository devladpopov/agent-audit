import type { CategoryScore, Finding, ScanResult, Status } from "./types.js";

const STATUS_ICON: Record<Status, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  info: "ℹ️",
  skip: "⏭️",
};

function locationText(f: { location?: { file?: string; line: number; column: number } }): string {
  if (!f.location) return "";
  const { file, line, column } = f.location;
  return `${file ? `${file}:` : ""}${line}:${column} `;
}

function metricsLines(result: ScanResult): string[] {
  if (!result.metrics) return [];
  return Object.entries(result.metrics).map(([k, v]) => `${k}: ${v}`);
}

function labelsText(result: ScanResult): string {
  const labels = result.target.labels;
  if (!labels || Object.keys(labels).length === 0) return "";
  return ` (${Object.entries(labels).map(([k, v]) => `${k}: ${v}`).join(", ")})`;
}

function scoreText(score: number | null): string {
  return score === null ? "not assessed" : `${score}/100`;
}

export function toJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Human-readable terminal/CI report. Kept dependency-free so it also works inside a GitHub Action log. */
export function toText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`${result.tool} ${result.scanner} v${result.toolVersion}: ${result.target.resolved}${labelsText(result)}`);
  lines.push(`Overall score: ${result.overallScore}/100 (grade ${result.grade})`);
  lines.push(...metricsLines(result));
  lines.push("");
  for (const cat of result.categories) {
    lines.push(`${cat.label}: ${scoreText(cat.score)}`);
    for (const f of cat.findings) {
      const sev = f.severity && (f.status === "fail" || f.status === "warn") ? ` ${f.severity}` : "";
      lines.push(`  ${STATUS_ICON[f.status]} ${locationText(f)}[${f.status}${sev}] ${f.title}: ${f.message}`);
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
  lines.push(`## ${result.tool} ${result.scanner} report for ${result.target.resolved}${labelsText(result)}`);
  lines.push("");
  lines.push(`**Overall score: ${result.overallScore}/100 (grade ${result.grade})**`);
  for (const m of metricsLines(result)) lines.push(`- ${m}`);
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
      lines.push(`- ${STATUS_ICON[f.status]} ${locationText(f)}**${f.title}**: ${f.message}`);
      if (f.fixSuggestion) lines.push(`  - Fix: ${f.fixSuggestion}`);
      if (f.specUrl) lines.push(`  - Spec: ${f.specUrl}`);
    }
  }
  return lines.join("\n");
}

const STATUS_CLASS: Record<Status, string> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
  info: "info",
  skip: "skip",
};

/** Minimal HTML-escaping: findings/messages can echo content from the scanned page (a store's own
 * HTML, robots.txt, etc.), which is attacker-controlled input as far as the report renderer is
 * concerned — never interpolate it into HTML unescaped. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findingHtml(f: Finding): string {
  const sev = f.severity && (f.status === "fail" || f.status === "warn") ? ` <span class="sev">${escapeHtml(f.severity)}</span>` : "";
  const loc = locationText(f);
  const parts = [
    `<li class="finding ${STATUS_CLASS[f.status]}">`,
    `<span class="icon">${STATUS_ICON[f.status]}</span> `,
    loc ? `<code>${escapeHtml(loc.trim())}</code> ` : "",
    `<strong>${escapeHtml(f.title)}</strong>${sev}: ${escapeHtml(f.message)}`,
  ];
  if (f.fixSuggestion) parts.push(`<div class="fix">Fix: ${escapeHtml(f.fixSuggestion)}</div>`);
  if (f.specUrl) parts.push(`<div class="spec"><a href="${escapeHtml(f.specUrl)}" rel="noopener noreferrer">Spec</a></div>`);
  parts.push("</li>");
  return parts.join("");
}

function categoryHtml(cat: CategoryScore): string {
  return [
    `<section class="category">`,
    `<h3>${escapeHtml(cat.label)}: <span class="score">${escapeHtml(scoreText(cat.score))}</span></h3>`,
    `<ul class="findings">${cat.findings.map(findingHtml).join("")}</ul>`,
    `</section>`,
  ].join("");
}

/**
 * A self-contained HTML fragment (no <html>/<body>) for the given result — the web version wraps
 * it in a page, but it's plain enough to drop into any other page too. No external assets, no JS.
 */
export function toHtml(result: ScanResult): string {
  const labels = result.target.labels;
  const labelBadges = labels
    ? Object.entries(labels).map(([k, v]) => `<span class="label">${escapeHtml(k)}: ${escapeHtml(v)}</span>`).join(" ")
    : "";
  const metrics = result.metrics
    ? `<ul class="metrics">${Object.entries(result.metrics).map(([k, v]) => `<li>${escapeHtml(k)}: ${v}</li>`).join("")}</ul>`
    : "";
  const errors = result.errors.length
    ? `<div class="errors"><strong>Errors:</strong><ul>${result.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`
    : "";
  return [
    `<div class="agent-audit-report">`,
    `<header>`,
    `<p class="target">${escapeHtml(result.tool)} ${escapeHtml(result.scanner)} report for <a href="${escapeHtml(result.target.resolved)}" rel="noopener noreferrer">${escapeHtml(result.target.resolved)}</a> ${labelBadges}</p>`,
    `<p class="overall">Overall score: <strong>${result.overallScore}/100</strong> (grade ${escapeHtml(result.grade)})</p>`,
    metrics,
    `</header>`,
    `<table class="category-table"><thead><tr><th>Category</th><th>Score</th></tr></thead><tbody>`,
    result.categories.map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${escapeHtml(scoreText(c.score))}</td></tr>`).join(""),
    `</tbody></table>`,
    result.categories.map(categoryHtml).join(""),
    errors,
    `</div>`,
  ].join("\n");
}

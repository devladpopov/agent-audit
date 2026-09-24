/** Reusable score badge, shared by this tool and the planned MCP Trust Scanner. */

function gradeColor(score: number): string {
  if (score >= 90) return "#2ea44f"; // green
  if (score >= 75) return "#97ca00"; // light green
  if (score >= 60) return "#dfb317"; // yellow
  if (score >= 40) return "#fe7d37"; // orange
  return "#e05d44"; // red
}

/** shields.io-style endpoint payload: https://shields.io/endpoint */
export function toShieldsEndpoint(label: string, score: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    label,
    message: `${score}/100`,
    color: gradeColor(score).replace("#", ""),
  });
}

/** Minimal inline SVG badge, no external service required (used by --badge output / self-hosted reports). */
export function toSvgBadge(label: string, score: number): string {
  const color = gradeColor(score);
  const value = `${score}/100`;
  const labelWidth = 6 * label.length + 10;
  const valueWidth = 6 * value.length + 10;
  const width = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

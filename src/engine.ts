import { fetchUrl, joinPath } from "./fetch/http.js";
import { extractJsonLd, loadHtml } from "./fetch/html.js";
import { ALL_RULES } from "./rules/index.js";
import { DEFAULT_CATEGORY_WEIGHTS, scoreCategory, scoreOverall } from "./core/scorer.js";
import { CATEGORIES, type Finding, type RuleContext, type ScanResult, type WellKnownProbe } from "./core/types.js";

const TOOL_NAME = "agent-audit";
const TOOL_VERSION = "0.1.0";

export async function runScan(inputUrl: string): Promise<ScanResult> {
  const errors: string[] = [];
  const normalizedUrl = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

  const page = await fetchUrl(normalizedUrl);
  if (page.error) errors.push(`Failed to fetch ${normalizedUrl}: ${page.error}`);

  const html = page.body ?? "";
  const $ = loadHtml(html);
  const jsonLd = extractJsonLd($);

  const robotsRes = await fetchUrl(joinPath(normalizedUrl, "/robots.txt"));

  const wellKnown: Record<string, WellKnownProbe> = {};
  const fetchText = async (path: string): Promise<WellKnownProbe> => {
    if (wellKnown[path]) return wellKnown[path];
    const res = await fetchUrl(joinPath(normalizedUrl, path));
    const probe: WellKnownProbe = {
      path,
      status: res.status,
      ok: res.ok,
      contentType: res.headers["content-type"],
      body: res.body ?? undefined,
      error: res.error,
    };
    wellKnown[path] = probe;
    return probe;
  };

  const ctx: RuleContext = {
    inputUrl: normalizedUrl,
    finalUrl: page.finalUrl,
    statusCode: page.status ?? 0,
    html,
    $,
    headers: page.headers,
    jsonLd,
    robotsTxt: { fetched: robotsRes.ok, body: robotsRes.ok ? robotsRes.body : null },
    wellKnown,
    fetchText,
  };

  const findings: Finding[] = [];
  // Sequential on purpose: some rules (e.g. feeds.sitemap-has-products, protocol.ap2-note)
  // read ctx.wellKnown populated by an earlier rule's fetchText call.
  for (const rule of ALL_RULES) {
    try {
      const outcome = await rule.check(ctx);
      findings.push({ id: rule.id, category: rule.category, title: rule.title, weight: rule.weight, specUrl: rule.specUrl, ...outcome });
    } catch (err) {
      errors.push(`Rule ${rule.id} threw: ${err instanceof Error ? err.message : String(err)}`);
      findings.push({
        id: rule.id,
        category: rule.category,
        title: rule.title,
        weight: rule.weight,
        specUrl: rule.specUrl,
        status: "skip",
        message: "Rule failed to execute.",
      });
    }
  }

  const categories = CATEGORIES.map((cat) =>
    scoreCategory(
      cat,
      findings.filter((f) => f.category === cat),
      DEFAULT_CATEGORY_WEIGHTS[cat],
    ),
  );
  const { overallScore, grade } = scoreOverall(categories);

  return {
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    scannedAt: new Date().toISOString(),
    inputUrl: normalizedUrl,
    finalUrl: page.finalUrl,
    overallScore,
    grade,
    categories,
    findings,
    errors,
  };
}

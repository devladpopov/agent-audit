import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { scanStore } from "../commerce/engine.js";
import { toHtml, toJson, toSvgBadge } from "../core/index.js";
import { checkPublicUrl } from "./ssrf-guard.js";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const SCAN_TIMEOUT_MS = 30_000;

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agent-audit — is your store ready for AI shopping agents?</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  form { display: flex; gap: 0.5rem; margin: 1.5rem 0; }
  input[type=url] { flex: 1; padding: 0.6rem; font-size: 1rem; }
  button { padding: 0.6rem 1.2rem; font-size: 1rem; cursor: pointer; }
  .overall strong { font-size: 1.4rem; }
  .label { display: inline-block; background: #eee; border-radius: 4px; padding: 0.1rem 0.5rem; font-size: 0.85rem; margin-left: 0.3rem; }
  .category-table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  .category-table td, .category-table th { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  .category { margin: 1.5rem 0; }
  .findings { list-style: none; padding: 0; }
  .finding { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
  .finding .fix, .finding .spec { font-size: 0.9rem; color: #555; margin-left: 1.6rem; }
  .finding code { background: #f4f4f4; padding: 0 0.2rem; }
  .errors { color: #b00; margin-top: 1rem; }
  footer { margin-top: 2rem; font-size: 0.85rem; color: #777; }
  .share { font-size: 0.9rem; margin: 1rem 0; }
  .share input { width: 100%; padding: 0.3rem; font-size: 0.85rem; }
</style>
</head>
<body>
<p><a href="/">agent-audit</a> — open-source readiness checker for agentic commerce</p>
${body}
<footer>
  <p>CLI: <code>npx agent-audit shop &lt;url&gt;</code> &middot;
  <a href="https://github.com/devladpopov/agent-audit">source</a></p>
</footer>
</body>
</html>`;
}

function homeForm(prefillUrl = ""): string {
  return `<form action="/report" method="get">
  <input type="url" name="url" placeholder="https://example-store.com" required value="${prefillUrl.replace(/"/g, "&quot;")}">
  <button type="submit">Scan</button>
</form>
<p>Enter a storefront URL. We check the home page, robots.txt, a product page and a few
well-known paths — nothing is installed, nothing is stored beyond this request.</p>`;
}

function errorPage(message: string, status: number): { status: number; body: string } {
  return { status, body: page(`<h1>Can't scan that</h1><p>${message}</p>${homeForm()}`) };
}

async function handleReport(url: URL, res: ServerResponse): Promise<void> {
  const target = url.searchParams.get("url")?.trim();
  const format = url.searchParams.get("format");
  const productUrl = url.searchParams.get("productUrl")?.trim() || undefined;

  if (!target) {
    const { status, body } = errorPage("Add a store URL, e.g. /report?url=https://example.com", 400);
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
    return;
  }

  const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  const check = await checkPublicUrl(normalized);
  if (!check.ok) {
    const { status, body } = errorPage(check.reason ?? "That URL isn't allowed.", 400);
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
    return;
  }
  if (productUrl) {
    const productCheck = await checkPublicUrl(/^https?:\/\//i.test(productUrl) ? productUrl : `https://${productUrl}`);
    if (!productCheck.ok) {
      const { status, body } = errorPage(productCheck.reason ?? "That product URL isn't allowed.", 400);
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
      return;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const result = await scanStore(normalized, { productUrl });
    clearTimeout(timeout);

    if (format === "json") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(toJson(result));
      return;
    }
    if (format === "badge") {
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" }).end(toSvgBadge("agent readiness", result.overallScore));
      return;
    }

    const shareUrl = `/report?url=${encodeURIComponent(normalized)}`;
    const body = `
${homeForm(normalized)}
${toHtml(result)}
<p class="share">Share this report: <input type="text" readonly value="${shareUrl}" onclick="this.select()"></p>
<p><a href="${shareUrl}&format=json">JSON</a> &middot; <img src="${shareUrl}&format=badge" alt="score badge" style="vertical-align:middle"></p>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(body));
  } catch (err) {
    clearTimeout(timeout);
    const { status, body } = errorPage(
      err instanceof Error ? escapeForError(err.message) : "Unexpected error while scanning.",
      502,
    );
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
  }
}

function escapeForError(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (url.pathname === "/report") {
    void handleReport(url, res);
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(homeForm()));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
});

server.listen(PORT, () => {
  console.log(`agent-audit web listening on http://localhost:${PORT}`);
});

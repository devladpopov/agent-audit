# agent-audit

[![npm](https://img.shields.io/npm/v/@devladpopov/agent-audit)](https://www.npmjs.com/package/@devladpopov/agent-audit)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![web version](https://img.shields.io/badge/web-scan%20your%20store-2ea44f)](https://agent-audit.globalmindsetmarketing.co.uk/)

**Lighthouse for AI shopping agents: one command tells you whether an AI agent can find, read and
buy from your store.**

**We scanned 35 stores: average AI-agent readiness 73.7/100, here is what breaks.**

```bash
npx @devladpopov/agent-audit shop https://your-store.com
```

Or paste a URL into the web version: **https://agent-audit.globalmindsetmarketing.co.uk**

Point it at a storefront and get a 0-100 score, broken down by category, with concrete fixes
linked to the relevant spec (UCP, ACP, AP2, schema.org). Built for merchants who aren't on Shopify
(WooCommerce, Magento/Adobe Commerce, PrestaShop, OpenCart, custom stacks) and therefore don't get
UCP/ACP support "for free" from their platform.

## What breaks (35 stores, September 2026)

32 of 35 stores were reachable; the other 3 returned 403 to an identified bot. Across the 32:

| Finding | Stores |
|---|---|
| Publish a UCP manifest at `/.well-known/ucp` | 0 of 32 |
| Product page has a usable schema.org `Product` node | 17 of 32 |
| ...of those, `Offer` includes `shippingDetails` | 2 of 17 |
| ...of those, `Offer` includes a return policy | 2 of 17 |
| Have an `llms.txt` | 4 of 32 |
| Show a captcha / anti-bot wall to an identified agent | 9 of 32 |
| Block AI agents in `robots.txt` | 0 of 32 |

The gap isn't access, it's data: agents can get in, but half the product pages don't say what the
product is, and almost none say what delivery and returns cost. By platform (n is small):
custom 78, OpenCart 76, Magento 76 (n=1), WooCommerce 72, PrestaShop 71.

The sample is hand-picked from platform showcases and agency portfolios, not random. The
anonymized per-store scores and the method are in [`data/`](data/).

## What it checks

| Category | What it looks at |
|---|---|
| `product-data` | schema.org `Product`/`Offer`/`AggregateOffer` JSON-LD: price, currency, availability, GTIN/SKU, brand, images, shipping details, return policy |
| `feeds` | Product sitemap, Google Merchant-style feed discoverability |
| `protocol-endpoints` | UCP manifest at `/.well-known/ucp`, ACP feed readiness notes, AP2 payment-handler hints |
| `agent-access` | `robots.txt` rules for known AI agents, `llms.txt`, content visible without JS, anti-bot walls |
| `checkout-readiness` | Agent-compatible PSP hints (Stripe/PayPal/Adyen), guest checkout, price transparency |
| `trust-signals` | HTTPS, contact/returns/privacy/terms pages |

Every finding links to the spec it's based on: [UCP](https://github.com/Universal-Commerce-Protocol/ucp-schema),
[ACP](https://developers.openai.com/commerce), [AP2](https://github.com/google-agentic-commerce/AP2),
[schema.org](https://schema.org/Product).

## Usage

```bash
npx @devladpopov/agent-audit shop https://example-store.com
npx @devladpopov/agent-audit shop https://example-store.com --product-url https://example-store.com/product/blue-mug
npx @devladpopov/agent-audit shop https://example-store.com --json
npx @devladpopov/agent-audit shop https://example-store.com --markdown
npx @devladpopov/agent-audit shop https://example-store.com --min-score 70   # CI gate: non-zero exit if below
```

Installed globally (`npm i -g @devladpopov/agent-audit`) the command is just `agent-audit`.

The scanner checks the home page, `robots.txt`, well-known paths, and product pages it finds itself
(product sitemaps, product-card links) — pass `--product-url` if it picks the wrong one. Product
data often varies between products on the same store, so by default it samples up to 3 discovered
pages and reports the median (`--product-samples <n>` to change that). Categories that can't be
measured from outside (checkout, for now) show as "not assessed" and don't count toward the score.

The report also detects the storefront platform (WooCommerce, Magento, PrestaShop, OpenCart,
Shopify) and swaps in a platform-specific fix — a plugin, setting or code snippet — for the checks
where one exists, instead of a generic "add JSON-LD" suggestion.

### GitHub Action

```yaml
- uses: devladpopov/agent-audit@v0.1.0
  with:
    url: https://example-store.com
    min-score: 70
    github-token: ${{ secrets.GITHUB_TOKEN }}   # optional: posts/updates a PR comment with the report
```

### Web version

Hosted at **https://agent-audit.globalmindsetmarketing.co.uk**: paste a URL, get the same report
as the CLI, share the link, embed the badge in your own README or site:

```markdown
![agent readiness](https://agent-audit.globalmindsetmarketing.co.uk/report?url=https://your-store.com&format=badge)
```

To self-host it:

```bash
bun run web            # from source, http://localhost:8787
bun run build && bun run web:start   # from dist/
```

It fetches whatever URL a visitor submits, so it validates against SSRF before scanning (rejects
`localhost`, private/link-local IPs including the cloud metadata address, non-http(s) schemes) —
see `src/web/ssrf-guard.ts`. There's no persistence: a "share" link just re-runs the scan when
opened, and `?format=json` / `?format=badge` are plain re-renders of the same result.

## Development

```bash
bun install
bun run src/cli.ts shop https://example.com   # run from source
bun test                                       # unit tests
bun run typecheck
bun run build                                  # -> dist/
```

## Architecture

The repo is set up for a series of scanners that share one engine. The store checker is the first;
an MCP server trust scanner is planned next.

- `src/core/`: scanner-agnostic. Rule/finding/score types, rule runner, scorer (0-100, grade,
  "not assessed" categories), text/Markdown/JSON reports, SVG and shields.io badges, HTTP client.
- `src/commerce/`: the store scanner. `engine.ts` fetches the home page, robots.txt, well-known
  paths and a product page once and builds the context; `rules/` has one file per category, each
  rule `{ id, category, weight, severity?, specUrl, check(ctx) }`.
- `src/cli.ts`: `agent-audit <scanner> <target>` with shared output flags.
- `src/web/`: a small Node HTTP server (`server.ts`) reusing `core/report.ts`'s HTML renderer, plus
  an SSRF guard (`ssrf-guard.ts`) since it scans whatever URL a visitor submits.

## Roadmap

- Checkout readiness needs a browser-driven cart/checkout crawl; it's "not assessed" until then.
- A larger, random sample per platform, so the numbers above can be quoted as "X% of stores".
- MCP server trust scanner and an AI-cliche text linter are planned as siblings on this engine.

## Contributing

Issues and PRs welcome — a new rule, a fix recipe for a platform/check pair not covered yet
(see `src/commerce/platform-fixes.ts`), or a report from running it against your own store.

## License

Apache-2.0, see `LICENSE`.

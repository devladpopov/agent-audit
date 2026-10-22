# agent-audit

Open-source readiness checker for **agentic commerce**. Point it at a storefront URL and get a
0-100 score, broken down by category, with concrete fixes linked to the relevant spec —
similar in spirit to Lighthouse, but for AI shopping agents instead of browsers.

Built for merchants who aren't on Shopify (WooCommerce, Magento/Adobe Commerce, PrestaShop,
OpenCart, custom stacks) and therefore don't get UCP/ACP support "for free" from their platform.

> Early release. The checks and scoring are real and tested, but the pilot run was on a small,
> hand-picked set of stores (not a random sample) — see the roadmap below before quoting numbers
> from it. Issues and PRs welcome, especially a fix recipe for a platform/check combination this
> doesn't cover yet.

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
npx agent-audit shop https://example-store.com
npx agent-audit shop https://example-store.com --product-url https://example-store.com/product/blue-mug
npx agent-audit shop https://example-store.com --json
npx agent-audit shop https://example-store.com --markdown
npx agent-audit shop https://example-store.com --min-score 70   # CI gate: non-zero exit if below
```

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

A minimal server: paste a URL, get the same report as the CLI, share the link, embed the badge.

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
- The pilot dataset (`research/`) isn't published here — it's a convenience sample (platform
  showcases and agency portfolios, not a random crawl) and shouldn't be quoted as "X% of stores
  are..." without a proper random sample per platform first.
- MCP server trust scanner and an AI-cliche text linter are planned as siblings on this engine.

## Contributing

Issues and PRs welcome — a new rule, a fix recipe for a platform/check pair not covered yet
(see `src/commerce/platform-fixes.ts`), or a report from running it against your own store.

## License

Apache-2.0, see `LICENSE`.

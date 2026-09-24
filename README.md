# agent-audit *(working name — pending final brand)*

Open-source readiness checker for **agentic commerce**. Point it at a storefront URL and get a
0-100 score, broken down by category, with concrete fixes linked to the relevant spec —
similar in spirit to Lighthouse, but for AI shopping agents instead of browsers.

Built for merchants who aren't on Shopify (WooCommerce, Magento/Adobe Commerce, PrestaShop,
OpenCart, custom stacks) and therefore don't get UCP/ACP support "for free" from their platform.

> Status: early scaffold, not yet published. See `CHECKPOINT.md` for current state.

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
npx agent-audit scan https://example-store.com
npx agent-audit scan https://example-store.com --json
npx agent-audit scan https://example-store.com --markdown
npx agent-audit scan https://example-store.com --min-score 70   # CI gate: non-zero exit if below
```

## Development

```bash
bun install
bun run src/cli.ts scan https://example.com   # run from source
bun test                                       # unit tests
bun run typecheck
bun run build                                  # -> dist/
```

## Architecture

- `src/core/` — scoring, report rendering (text/markdown/JSON), SVG badge. Kept generic on purpose
  so a future sibling tool (an MCP security scanner) can reuse the same engine shape.
- `src/fetch/` — HTTP client, HTML/JSON-LD parsing, robots.txt parsing.
- `src/rules/` — one file per category; each rule is `{ id, category, weight, specUrl, check(ctx) }`.
- `src/engine.ts` — fetches the page + well-known paths once, runs all rules, aggregates the score.
- `src/cli.ts` — thin CLI wrapper (`commander`) over `runScan()`.

## License

Apache-2.0 (see `LICENSE`) — pending final confirmation before publication.

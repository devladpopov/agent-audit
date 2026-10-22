# Dataset: 35 non-Shopify stores, September 2026

`stores-2026-09.csv` is the scan behind the numbers in the main README. One row per store, store
names removed: only the detected platform, the overall score and the per-category scores.

- **Sample:** 35 live storefronts (WooCommerce, PrestaShop, OpenCart, Magento, custom stacks),
  mostly UK/EU, taken from platform showcase pages and agency portfolios. It is a convenience
  sample, not a random one, and probably skews toward better-resourced merchants.
- **Reachable:** 32 of 35. Three returned 403 to an identified bot and have no scores.
- **Average overall score (32 reachable):** 73.7/100, median 74.
- **Tool version:** agent-audit 0.1.0, default settings (median of up to 3 product pages).
- `checkout-readiness` is empty everywhere: it isn't assessed from outside yet and doesn't count
  toward the overall score.

Treat per-platform averages as direction, not fact: n is 1 to 9 per platform.

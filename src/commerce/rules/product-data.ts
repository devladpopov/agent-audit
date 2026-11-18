import type { CommerceRule } from "../types.js";
import { findByType, findProducts } from "../fetch/html.js";

const SCHEMA_SPEC = "https://schema.org/Product";

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined ? [] : [v];
}

function getOffers(product: Record<string, unknown>): Record<string, unknown>[] {
  const offers = asArray(product.offers);
  return offers.filter((o): o is Record<string, unknown> => !!o && typeof o === "object");
}

const SOURCE_NOTE: Record<string, string> = {
  input: "the scanned URL (it already is a product page)",
  user: "the product page passed with --product-url",
  discovered: "a product page discovered from the store's links/sitemap",
  "homepage-fallback": "the home page, because no product page could be discovered (pass --product-url for an accurate result)",
};

export const productDataRules: CommerceRule[] = [
  {
    id: "product-data.page-used",
    category: "product-data",
    title: "Page used for product-data checks",
    weight: 0,
    check(ctx) {
      return { status: "info", message: `Checked ${ctx.product.url}: ${SOURCE_NOTE[ctx.productSource]}.` };
    },
  },
  {
    id: "product-data.has-jsonld",
    category: "product-data",
    title: "Page exposes at least one JSON-LD block",
    weight: 1,
    specUrl: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
    check(ctx) {
      if (ctx.product.jsonLd.length > 0) return { status: "pass", message: `${ctx.product.jsonLd.length} JSON-LD node(s) found.` };
      return {
        status: "fail",
        message: "No <script type=\"application/ld+json\"> found on the page.",
        fixSuggestion: "Add schema.org JSON-LD (Product/Offer) to product pages so agents can parse them without guessing at HTML.",
      };
    },
  },
  {
    id: "product-data.has-product-type",
    category: "product-data",
    title: "JSON-LD includes a Product entity",
    weight: 3,
    specUrl: SCHEMA_SPEC,
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length > 0) return { status: "pass", message: `${products.length} Product node(s) found.` };
      if (ctx.product.$('[itemtype*="schema.org/Product" i]').length > 0) {
        return {
          status: "warn",
          message: "Product is marked up with microdata only, no JSON-LD. Parsers that only read JSON-LD will miss it, and the offer checks below are skipped.",
          fixSuggestion: "Add a JSON-LD Product block alongside (or instead of) the microdata; Google and most agent tooling prefer JSON-LD.",
        };
      }
      return {
        status: "fail",
        message: "No schema.org Product entity in JSON-LD.",
        fixSuggestion: "Emit a Product JSON-LD block per product page (name, image, offers, brand).",
      };
    },
  },
  {
    id: "product-data.offer-price-currency",
    category: "product-data",
    title: "Offer declares price and priceCurrency",
    weight: 3,
    specUrl: "https://schema.org/Offer",
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const missing: string[] = [];
      let anyOffer = false;
      for (const p of products) {
        for (const offer of getOffers(p)) {
          anyOffer = true;
          if (offer.price === undefined && offer.priceSpecification === undefined) missing.push("price");
          if (offer.priceCurrency === undefined) missing.push("priceCurrency");
        }
      }
      if (!anyOffer)
        return {
          status: "fail",
          message: "Product has no offers.",
          fixSuggestion: "Add an Offer (or AggregateOffer) with price and priceCurrency to each Product.",
        };
      if (missing.length === 0) return { status: "pass", message: "price and priceCurrency present." };
      return {
        status: "warn",
        message: `Offer missing: ${[...new Set(missing)].join(", ")}.`,
        fixSuggestion: "Populate price and priceCurrency (ISO 4217, e.g. GBP) on every Offer.",
      };
    },
  },
  {
    id: "product-data.availability",
    category: "product-data",
    title: "Offer declares availability",
    weight: 2,
    specUrl: "https://schema.org/availability",
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const offers = products.flatMap(getOffers);
      if (offers.length === 0) return { status: "skip", message: "No offers to check." };
      const withAvailability = offers.filter((o) => o.availability !== undefined).length;
      if (withAvailability === offers.length) return { status: "pass", message: "availability present on all offers." };
      return {
        status: "warn",
        message: `${offers.length - withAvailability}/${offers.length} offer(s) missing availability.`,
        fixSuggestion: "Set availability (e.g. https://schema.org/InStock) on every Offer so agents don't sell out-of-stock items.",
      };
    },
  },
  {
    id: "product-data.identifier",
    category: "product-data",
    title: "Product has a GTIN/SKU/MPN identifier",
    weight: 2,
    specUrl: "https://schema.org/gtin",
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const idFields = ["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "sku", "mpn"];
      const missing = products.filter((p) => !idFields.some((f) => p[f] !== undefined));
      if (missing.length === 0) return { status: "pass", message: "Product identifier present." };
      return {
        status: "warn",
        message: `${missing.length}/${products.length} product(s) missing gtin/sku/mpn.`,
        fixSuggestion: "Add at least one of gtin13/sku/mpn — agents use it to match your listing across catalogs.",
      };
    },
  },
  {
    id: "product-data.brand-and-image",
    category: "product-data",
    title: "Product has brand and image",
    weight: 1,
    specUrl: SCHEMA_SPEC,
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const missingBrand = products.filter((p) => p.brand === undefined).length;
      const missingImage = products.filter((p) => p.image === undefined).length;
      if (missingBrand === 0 && missingImage === 0) return { status: "pass", message: "brand and image present." };
      return {
        status: "warn",
        message: `Missing brand on ${missingBrand}, image on ${missingImage} product(s).`,
        fixSuggestion: "Add brand (Organization/Brand) and image (absolute URL) to every Product.",
      };
    },
  },
  {
    id: "product-data.shipping-details",
    category: "product-data",
    title: "Offer declares shippingDetails",
    weight: 2,
    specUrl: "https://schema.org/OfferShippingDetails",
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const offers = products.flatMap(getOffers);
      if (offers.length === 0) return { status: "skip", message: "No offers to check." };
      const withShipping = offers.filter((o) => o.shippingDetails !== undefined).length;
      if (withShipping === offers.length) return { status: "pass", message: "shippingDetails present on all offers." };
      return {
        status: "warn",
        message: `${offers.length - withShipping}/${offers.length} offer(s) missing shippingDetails.`,
        fixSuggestion: "Add OfferShippingDetails so agents can quote a total price before checkout.",
      };
    },
  },
  {
    id: "product-data.return-policy",
    category: "product-data",
    title: "Offer declares hasMerchantReturnPolicy",
    weight: 2,
    specUrl: "https://schema.org/MerchantReturnPolicy",
    check(ctx) {
      const products = findProducts(ctx.product.jsonLd);
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const offers = products.flatMap(getOffers);
      if (offers.length === 0) return { status: "skip", message: "No offers to check." };
      const withPolicy = offers.filter((o) => o.hasMerchantReturnPolicy !== undefined).length;
      if (withPolicy === offers.length) return { status: "pass", message: "hasMerchantReturnPolicy present on all offers." };
      return {
        status: "warn",
        message: `${offers.length - withPolicy}/${offers.length} offer(s) missing hasMerchantReturnPolicy.`,
        fixSuggestion: "Add a MerchantReturnPolicy — agents increasingly refuse to checkout without visible return terms.",
      };
    },
  },
  {
    id: "product-data.gtin-valid",
    category: "product-data",
    title: "GTINs pass the GS1 check digit",
    weight: 2,
    specUrl: "https://www.gs1.org/services/how-calculate-check-digit-manually",
    check(ctx) {
      const values = collectGtins(ctx.product.jsonLd);
      if (values.length === 0) return { status: "skip", message: "No gtin/gtin8/gtin12/gtin13/gtin14 value to check." };
      const invalid = values.filter((v) => !isValidGtin(v.value));
      if (invalid.length === 0) return { status: "pass", message: `${values.length} GTIN(s) with a valid check digit.` };
      return {
        status: "fail",
        message: `${invalid.length}/${values.length} GTIN(s) are not valid GS1 numbers: ${invalid
          .slice(0, 3)
          .map((v) => `${v.field}="${v.value}"`)
          .join(", ")}. Agents and merchant feeds reject or mismatch products with a bad GTIN.`,
        fixSuggestion: "Use the full 8/12/13/14-digit GTIN from your GS1 allocation, digits only. If a product has no GTIN, omit the field and use sku/mpn instead of a placeholder.",
      };
    },
  },
  {
    id: "product-data.variants",
    category: "product-data",
    title: "Variants are modelled as a ProductGroup",
    weight: 1,
    specUrl: "https://developers.google.com/search/docs/appearance/structured-data/product-variants",
    check(ctx) {
      const groups = findByType(ctx.product.jsonLd, "ProductGroup");
      const products = findByType(ctx.product.jsonLd, "Product");
      if (groups.length === 0 && products.length === 0) return { status: "skip", message: "No Product or ProductGroup node to check." };
      const variantCount = groups.reduce((n, g) => n + asArray(g.hasVariant).length, 0);
      if (variantCount > 0) {
        const variesBy = [...new Set(groups.flatMap((g) => asArray(g.variesBy).map((v) => String(v).replace(/^https?:\/\/schema\.org\//, ""))))];
        return {
          status: "pass",
          message: `ProductGroup with ${variantCount} variant(s)${variesBy.length > 0 ? `, varies by ${variesBy.join(", ")}` : ""}.`,
        };
      }
      if (products.some((p) => p.isVariantOf !== undefined)) {
        return { status: "pass", message: "Product links to its ProductGroup with isVariantOf." };
      }
      const offerCount = products.flatMap(getOffers).reduce((n, o) => {
        const declared = Number(o.offerCount);
        return n + (o["@type"] === "AggregateOffer" && declared > 1 ? declared : 1);
      }, 0);
      if (products.length > 1 || offerCount > 1) {
        return {
          status: "info",
          message: `${products.length} Product node(s) with ${offerCount} offer(s) but no ProductGroup, so agents can't tell which size/colour each offer is.`,
          fixSuggestion: "Wrap variants in a ProductGroup with productGroupID, variesBy and hasVariant (one Product per SKU with its own offer).",
        };
      }
      return { status: "info", message: "Single product with one offer; no variants declared." };
    },
  },
  {
    id: "product-data.reviews",
    category: "product-data",
    title: "Product exposes ratings or reviews",
    weight: 1,
    specUrl: "https://schema.org/AggregateRating",
    check(ctx) {
      const products = [...findByType(ctx.product.jsonLd, "Product"), ...findByType(ctx.product.jsonLd, "ProductGroup")];
      if (products.length === 0) return { status: "skip", message: "No Product node to check." };
      const rated = products.find((p) => p.aggregateRating !== undefined || p.review !== undefined);
      if (rated) {
        const rating = rated.aggregateRating as Record<string, unknown> | undefined;
        const count = rating?.reviewCount ?? rating?.ratingCount;
        return {
          status: "pass",
          message:
            rating?.ratingValue !== undefined
              ? `aggregateRating ${rating.ratingValue}${count !== undefined ? ` from ${count} review(s)` : ""}.`
              : "Product declares review(s).",
        };
      }
      return {
        status: "warn",
        message: "No aggregateRating or review on the Product. Agents comparing options across stores fall back to other sites' ratings, or skip the product.",
        fixSuggestion: "Emit aggregateRating (ratingValue, reviewCount) from your reviews app in the Product JSON-LD, only for genuine on-site reviews.",
      };
    },
  },
];

const GTIN_FIELDS = ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"];

/** GTIN values on every Product, ProductGroup variant and Offer in the page's JSON-LD. */
function collectGtins(jsonLd: unknown[]): { field: string; value: string }[] {
  const nodes: Record<string, unknown>[] = [];
  const products = findByType(jsonLd, "Product");
  for (const g of findByType(jsonLd, "ProductGroup")) {
    nodes.push(g);
    products.push(...asArray(g.hasVariant).filter((v): v is Record<string, unknown> => !!v && typeof v === "object"));
  }
  for (const p of new Set(products)) nodes.push(p, ...getOffers(p));
  const out: { field: string; value: string }[] = [];
  for (const node of nodes) {
    for (const field of GTIN_FIELDS) {
      const raw = node[field];
      if (typeof raw === "string" || typeof raw === "number") {
        const value = String(raw).trim();
        if (value) out.push({ field, value });
      }
    }
  }
  return out;
}

/**
 * GS1 check-digit test for GTIN-8/12/13/14. Spaces and hyphens are tolerated; a GS1 Digital Link
 * URL (".../01/<gtin14>") is checked on its embedded GTIN, since schema.org allows that form.
 */
export function isValidGtin(raw: string): boolean {
  const link = /\/01\/(\d{8,14})(?:[/?#]|$)/.exec(raw);
  const digits = link ? link[1]! : raw.replace(/[\s-]/g, "");
  // All zeros passes the arithmetic but is a common placeholder, not a real allocation.
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits) || /^0+$/.test(digits)) return false;
  // Weights alternate 3,1,3,... from the rightmost digit before the check digit.
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

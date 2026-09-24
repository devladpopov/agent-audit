import type { Rule } from "../core/types.js";
import { findByType } from "../fetch/html.js";

const SCHEMA_SPEC = "https://schema.org/Product";

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined ? [] : [v];
}

function getOffers(product: Record<string, unknown>): Record<string, unknown>[] {
  const offers = asArray(product.offers);
  return offers.filter((o): o is Record<string, unknown> => !!o && typeof o === "object");
}

export const productDataRules: Rule[] = [
  {
    id: "product-data.has-jsonld",
    category: "product-data",
    title: "Page exposes at least one JSON-LD block",
    weight: 1,
    specUrl: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
    check(ctx) {
      if (ctx.jsonLd.length > 0) return { status: "pass", message: `${ctx.jsonLd.length} JSON-LD node(s) found.` };
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
      const products = findByType(ctx.jsonLd, "Product");
      if (products.length > 0) return { status: "pass", message: `${products.length} Product node(s) found.` };
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
      const products = findByType(ctx.jsonLd, "Product");
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
      const products = findByType(ctx.jsonLd, "Product");
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
      const products = findByType(ctx.jsonLd, "Product");
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
      const products = findByType(ctx.jsonLd, "Product");
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
      const products = findByType(ctx.jsonLd, "Product");
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
      const products = findByType(ctx.jsonLd, "Product");
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
];

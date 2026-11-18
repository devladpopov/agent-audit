import type { Platform } from "./platform.js";

/**
 * Platform-specific replacement for a generic fixSuggestion, keyed by rule id.
 * Covers the checks most non-Shopify merchants fail (see research/day3-findings.md).
 * Extend as new platforms/rules earn a recipe; a missing entry just keeps the generic fix.
 */
export const PLATFORM_FIXES: Partial<Record<string, Partial<Record<Platform, string>>>> = {
  "product-data.has-jsonld": {
    woocommerce: 'Install "Yoast SEO" or "Schema & Structured Data for WP" and enable Product schema, or add JSON-LD in your product template with WooCommerce template hooks.',
    magento: "Adobe Commerce/Magento Open Source emit Product JSON-LD by default (Catalog > Rich Snippets); if it's missing, check that a theme override didn't strip it and that Google Rich Snippets isn't disabled in Stores > Configuration.",
    prestashop: 'Update to PrestaShop 1.7.7+/8.x, which ships Product JSON-LD by default, or install a structured-data module (e.g. "Structured Data (JSON-LD)" from the Addons marketplace).',
    opencart: "OpenCart has no built-in JSON-LD. Install a structured-data extension from the OpenCart Marketplace, or add a JSON-LD block to catalog/view/theme/*/template/product/product.twig.",
  },
  "product-data.shipping-details": {
    woocommerce: 'Most SEO plugins don\'t fill shippingDetails automatically; add it via a schema plugin\'s custom fields or a small filter on woocommerce_structured_data_product.',
    magento: 'Add shippingDetails to the Product schema via a layout XML override of the JSON-LD block (Magento_CatalogRichSnippet); no core UI setting.',
    prestashop: "Enable shipping costs display in Preferences > Shipping, and check the structured-data module has a shippingDetails template (not all do).",
    opencart: "Add shippingDetails to the JSON-LD block you install; OpenCart doesn't compute it for you.",
  },
  "product-data.return-policy": {
    woocommerce: 'Add a returns policy page and reference it via a schema plugin\'s "merchant return policy" field, or filter woocommerce_structured_data_product to add hasMerchantReturnPolicy.',
    magento: "Adobe Commerce 2.4.6+ has a Return & Refund Policy field per product/store view (Content > Configuration); Open Source needs a layout override to emit hasMerchantReturnPolicy.",
    prestashop: "Set your returns policy under Shop Parameters > Customer Service, and confirm your structured-data module maps it to hasMerchantReturnPolicy (many don't by default).",
    opencart: "Add hasMerchantReturnPolicy to your JSON-LD extension; there's no core field for it.",
  },
  "feeds.sitemap-present": {
    woocommerce: 'Enable the XML sitemap in Yoast SEO / Rank Math (usually on by default), or add "WP Sitemap Page" if you run no SEO plugin.',
    magento: "Stores > Configuration > Catalog > XML Sitemap, then generate it once under Marketing > SEO & Search > Site Map and schedule the cron job.",
    prestashop: 'Install the "Google Sitemap" module (ships with core on most versions) and generate it under its configuration page.',
    opencart: "OpenCart has no built-in sitemap. Install a sitemap extension from the Marketplace or add a route that outputs one.",
  },
  "agent-access.llms-txt": {
    woocommerce: "Drop an llms.txt file in your theme's root via an SFTP/plugin file manager, or add a rewrite rule that serves wp-content/llms.txt at /llms.txt.",
    magento: "Add llms.txt to pub/ (Magento serves pub/ as webroot), or add a static route for /llms.txt.",
    prestashop: "Add llms.txt next to index.php in your PrestaShop webroot.",
    opencart: "Add llms.txt to the OpenCart webroot (same directory as index.php).",
  },
  "protocol.ucp-manifest": {
    woocommerce: "No official UCP plugin yet as of Sept 2026; publish a static /.well-known/ucp JSON file matching the UCP schema, or watch for a WooCommerce UCP extension.",
    magento: "No official Adobe Commerce UCP module yet; publish a static /.well-known/ucp file, or track Adobe's roadmap for native support.",
    prestashop: "No official PrestaShop UCP module yet; publish a static /.well-known/ucp file under your webroot.",
    opencart: "No OpenCart UCP extension yet; publish a static /.well-known/ucp file, or add a controller route that serves it.",
  },
  "trust.returns-policy": {
    woocommerce: "Add a Returns & Refunds page and link it in your footer menu (Appearance > Menus).",
    magento: "Add a CMS page for your return policy and add it to the footer links block (Content > Elements > Blocks).",
    prestashop: "Add a CMS page under Preferences > CMS and link it in Shop Parameters > Theme > Pages you want to display.",
    opencart: "Add an Information page (Catalog > Information) for returns and add it to the footer via the theme layout.",
  },
  "agent-access.ai-agent-policy": {
    shopify: "Edit robots.txt via a robots.txt.liquid template (Online Store > Themes > Edit code > Add a new template > robots) and add an Allow group for ChatGPT-User, OAI-SearchBot, Perplexity-User and Claude-User.",
    woocommerce: "Edit robots.txt in Yoast SEO (Tools > File editor) or Rank Math (General Settings > Edit robots.txt) and give the user-triggered agents their own Allow group; check security plugins (Wordfence, Cloudflare) aren't blocking them too.",
    magento: "Edit robots.txt in Content > Design > Configuration > (store view) > Search Engine Robots > Edit custom instruction of robots.txt File.",
    prestashop: "Regenerate robots.txt under Shop Parameters > Traffic & SEO, then add the agent Allow groups by hand (regeneration overwrites manual edits, so re-apply them).",
    opencart: "Edit robots.txt in the OpenCart webroot and add an Allow group for the user-triggered agents.",
  },
  "product-data.reviews": {
    shopify: "Use a reviews app that writes aggregateRating into the Product JSON-LD (Judge.me, Okendo and Yotpo can), or add it from product metafields in your theme's product template.",
    woocommerce: "Enable reviews (Settings > Products > Enable product reviews); WooCommerce adds aggregateRating to its Product JSON-LD once a product has an approved review.",
    magento: "Enable Product Reviews (Stores > Configuration > Catalog > Product Reviews); check your theme's JSON-LD includes the review summary, since the core markup is microdata.",
    prestashop: 'Enable the "Product Comments" module; its ratings are output as aggregateRating on 1.7.7+/8.x themes.',
    opencart: "Enable reviews (System > Settings > Option > Reviews) and add aggregateRating to your JSON-LD extension.",
  },
  "trust.organization-schema": {
    shopify: "Most Shopify themes emit Organization JSON-LD in theme.liquid only when Settings > Social media is filled in; add the links, or paste an Organization JSON-LD block into theme.liquid.",
    woocommerce: "Fill in Yoast SEO > Settings > Site representation (Organization, logo, social profiles) or Rank Math > Titles & Meta > Local SEO.",
    magento: "No core Organization markup; add a JSON-LD block to the default head blocks (Content > Design > Configuration > HTML Head > Scripts and Style Sheets).",
    prestashop: "Most structured-data modules add Organization on the home page; otherwise add a JSON-LD block to your theme's head.tpl.",
    opencart: "Add an Organization JSON-LD block to catalog/view/theme/*/template/common/header.twig.",
  },
};

export function platformFix(ruleId: string, platform: Platform): string | undefined {
  return PLATFORM_FIXES[ruleId]?.[platform];
}

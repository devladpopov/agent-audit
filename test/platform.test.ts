import { describe, expect, test } from "bun:test";
import { detectPlatform } from "../src/commerce/platform.js";
import { loadHtml, extractJsonLd } from "../src/commerce/fetch/html.js";
import type { PageSnapshot } from "../src/commerce/types.js";

function page(html: string): PageSnapshot {
  const $ = loadHtml(html);
  return { url: "https://example.com/", html, $, jsonLd: extractJsonLd($) };
}

describe("detectPlatform", () => {
  test("woocommerce", () => {
    const html = '<html><body class="woocommerce"><script src="/wp-content/plugins/woocommerce/x.js"></script></body></html>';
    expect(detectPlatform([page(html)], {}).platform).toBe("woocommerce");
  });

  test("magento via header", () => {
    expect(detectPlatform([page("<html></html>")], { "X-Magento-Varnish-Pool": "x" }).platform).toBe("magento");
  });

  test("magento via form_key", () => {
    expect(detectPlatform([page('<input name="form_key" value="abc">')], {}).platform).toBe("magento");
  });

  test("prestashop", () => {
    expect(detectPlatform([page('<body id="product" data-id_product="42">')], {}).platform).toBe("prestashop");
  });

  test("opencart", () => {
    expect(detectPlatform([page('<link href="/catalog/view/theme/default/stylesheet/style.css">')], {}).platform).toBe(
      "opencart",
    );
  });

  test("shopify", () => {
    expect(detectPlatform([page('<script src="https://cdn.shopify.com/s/files/x.js"></script>')], {}).platform).toBe(
      "shopify",
    );
  });

  test("falls back to other", () => {
    expect(detectPlatform([page("<html><body>Hand-rolled store</body></html>")], {}).platform).toBe("other");
  });

  test("never throws on hostile input", () => {
    expect(() => detectPlatform([page("")], {})).not.toThrow();
  });
});

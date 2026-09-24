import type { CommerceRule } from "../types.js";

const AGENT_COMPATIBLE_PSPS = ["stripe", "paypal", "adyen", "klarna", "braintree"];

/**
 * Checkout can't be verified from a static page fetch, so every rule here reports "info" and the
 * category shows as "not assessed" instead of a fake 100. Detected signals are still reported.
 * Real scoring arrives with the browser-driven cart/checkout crawl (roadmap).
 */
export const checkoutReadinessRules: CommerceRule[] = [
  {
    id: "checkout.psp-hint",
    category: "checkout-readiness",
    title: "Agent-compatible payment provider signals",
    weight: 2,
    specUrl: "https://developers.openai.com/commerce",
    check(ctx) {
      const haystack = (ctx.home.html + ctx.product.html).toLowerCase();
      const found = AGENT_COMPATIBLE_PSPS.filter((p) => haystack.includes(p));
      if (found.length > 0) {
        return { status: "info", message: `Detected references to: ${found.join(", ")}.` };
      }
      return {
        status: "info",
        message: "No Stripe/PayPal/Adyen/Klarna/Braintree reference on the scanned pages. Weak signal: checkout usually loads elsewhere.",
        fixSuggestion: "Agent checkout flows (ACP, UCP) currently go through PSPs such as Stripe, PayPal and Adyen.",
      };
    },
  },
  {
    id: "checkout.guest-checkout-hint",
    category: "checkout-readiness",
    title: "Guest checkout wording",
    weight: 1,
    check(ctx) {
      const haystack = (ctx.home.html + ctx.product.html).toLowerCase();
      if (haystack.includes("guest checkout") || haystack.includes("checkout as guest")) {
        return { status: "info", message: "Found explicit guest-checkout wording." };
      }
      return {
        status: "info",
        message: "No guest-checkout wording on the scanned pages. Inconclusive without crawling the cart flow.",
        fixSuggestion: "Offer guest checkout: agents generally cannot complete an account-registration flow.",
      };
    },
  },
];

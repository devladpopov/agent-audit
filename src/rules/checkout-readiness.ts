import type { Rule } from "../core/types.js";

const AGENT_COMPATIBLE_PSPS = ["stripe", "paypal", "adyen"];

export const checkoutReadinessRules: Rule[] = [
  {
    id: "checkout.psp-hint",
    category: "checkout-readiness",
    title: "Page references an agent-compatible payment provider",
    weight: 2,
    specUrl: "https://developers.openai.com/commerce",
    check(ctx) {
      const haystack = ctx.html.toLowerCase();
      const found = AGENT_COMPATIBLE_PSPS.filter((p) => haystack.includes(p));
      if (found.length > 0) {
        return { status: "pass", message: `Detected reference to: ${found.join(", ")}.` };
      }
      return {
        status: "info",
        message: "Could not detect Stripe/PayPal/Adyen from the homepage — this is a weak signal since checkout usually loads on a separate page.",
        fixSuggestion: "Use ACP-connected PSPs (Stripe, PayPal, Adyen) to be reachable via agent checkout flows.",
      };
    },
  },
  {
    id: "checkout.guest-checkout-hint",
    category: "checkout-readiness",
    title: "Guest checkout appears to be supported",
    weight: 1,
    check(ctx) {
      const haystack = ctx.html.toLowerCase();
      if (haystack.includes("guest checkout") || haystack.includes("checkout as guest")) {
        return { status: "pass", message: "Found explicit guest-checkout wording." };
      }
      return {
        status: "info",
        message: "No explicit guest-checkout wording found on the homepage — inconclusive without crawling the cart flow.",
        fixSuggestion: "Offer guest checkout: agents generally cannot complete an account-registration flow.",
      };
    },
  },
  {
    id: "checkout.price-transparency-note",
    category: "checkout-readiness",
    title: "Total price transparency before payment",
    weight: 1,
    check() {
      return {
        status: "info",
        message: "Requires crawling the cart/checkout flow to verify — not assessed by a single-page scan. Planned for the browser-driven check (see roadmap).",
      };
    },
  },
];

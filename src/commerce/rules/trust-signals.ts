import type { CommerceContext, CommerceRule } from "../types.js";

function linkTextIncludes(ctx: CommerceContext, needles: string[]): boolean {
  let found = false;
  ctx.home.$("a").each((_i, el) => {
    const text = ctx.home.$(el).text().toLowerCase();
    const href = (ctx.home.$(el).attr("href") ?? "").toLowerCase();
    if (needles.some((n) => text.includes(n) || href.includes(n))) found = true;
  });
  return found;
}

export const trustSignalRules: CommerceRule[] = [
  {
    id: "trust.https",
    category: "trust-signals",
    title: "Site is served over HTTPS",
    weight: 3,
    check(ctx) {
      const isHttps = ctx.finalUrl.startsWith("https://");
      if (isHttps) return { status: "pass", message: "Final URL uses HTTPS." };
      return {
        status: "fail",
        message: "Site does not enforce HTTPS.",
        fixSuggestion: "Serve the storefront over HTTPS and redirect HTTP to HTTPS — most agent platforms refuse to checkout over plain HTTP.",
      };
    },
  },
  {
    id: "trust.contact-page",
    category: "trust-signals",
    title: "Contact information is linked",
    weight: 1,
    check(ctx) {
      if (linkTextIncludes(ctx, ["contact", "support", "help"])) {
        return { status: "pass", message: "Found a contact/support link." };
      }
      return {
        status: "warn",
        message: "No contact/support link found in the page.",
        fixSuggestion: "Link a contact or support page from the footer.",
      };
    },
  },
  {
    id: "trust.returns-policy",
    category: "trust-signals",
    title: "Returns/refund policy is linked",
    weight: 2,
    check(ctx) {
      if (linkTextIncludes(ctx, ["return", "refund"])) {
        return { status: "pass", message: "Found a returns/refund link." };
      }
      return {
        status: "warn",
        message: "No returns/refund link found.",
        fixSuggestion: "Link a clear returns/refund policy — several agent checkout flows require it before purchase.",
      };
    },
  },
  {
    id: "trust.privacy-policy",
    category: "trust-signals",
    title: "Privacy policy is linked",
    weight: 1,
    check(ctx) {
      if (linkTextIncludes(ctx, ["privacy"])) {
        return { status: "pass", message: "Found a privacy policy link." };
      }
      return {
        status: "warn",
        message: "No privacy policy link found.",
        fixSuggestion: "Link a privacy policy in the footer.",
      };
    },
  },
  {
    id: "trust.terms",
    category: "trust-signals",
    title: "Terms of service is linked",
    weight: 1,
    check(ctx) {
      if (linkTextIncludes(ctx, ["terms"])) {
        return { status: "pass", message: "Found a terms-of-service link." };
      }
      return {
        status: "warn",
        message: "No terms-of-service link found.",
        fixSuggestion: "Link your terms of service in the footer.",
      };
    },
  },
];

import type { CommerceContext, CommerceRule } from "../types.js";
import { findByType } from "../fetch/html.js";

function linkTextIncludes(ctx: CommerceContext, needles: string[]): boolean {
  let found = false;
  ctx.home.$("a").each((_i, el) => {
    const text = ctx.home.$(el).text().toLowerCase();
    const href = (ctx.home.$(el).attr("href") ?? "").toLowerCase();
    if (needles.some((n) => text.includes(n) || href.includes(n))) found = true;
  });
  return found;
}

/** schema.org types that describe the business behind a store. */
const ORGANIZATION_TYPES = ["Organization", "Corporation", "OnlineStore", "OnlineBusiness", "Store", "LocalBusiness"];

/** Organization-like nodes on the home page, including one nested as a WebSite's publisher. */
function organizationNodes(jsonLd: unknown[]): Record<string, unknown>[] {
  const nodes = ORGANIZATION_TYPES.flatMap((t) => findByType(jsonLd, t));
  for (const site of findByType(jsonLd, "WebSite")) {
    const publisher = site.publisher;
    if (publisher && typeof publisher === "object" && !Array.isArray(publisher)) {
      const node = publisher as Record<string, unknown>;
      const type = node["@type"];
      if (ORGANIZATION_TYPES.some((t) => t === type || (Array.isArray(type) && type.includes(t)))) nodes.push(node);
    }
  }
  return [...new Set(nodes)];
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
  {
    id: "trust.organization-schema",
    category: "trust-signals",
    title: "Home page identifies the business in Organization JSON-LD",
    weight: 1,
    specUrl: "https://developers.google.com/search/docs/appearance/structured-data/organization",
    check(ctx) {
      const orgs = organizationNodes(ctx.home.jsonLd);
      if (orgs.length === 0) {
        return {
          status: "warn",
          message: "No Organization/OnlineStore JSON-LD on the home page. Agents have no machine-readable way to confirm who runs the store or how to reach them.",
          fixSuggestion: "Add an Organization (or OnlineStore) JSON-LD block to the home page with name, url, logo, contactPoint (email/telephone) and sameAs links to your official profiles.",
        };
      }
      const hasContact = (o: Record<string, unknown>) =>
        o.contactPoint !== undefined || o.sameAs !== undefined || o.email !== undefined || o.telephone !== undefined;
      const complete = orgs.find((o) => o.name !== undefined && o.url !== undefined && hasContact(o));
      if (complete) {
        const type = Array.isArray(complete["@type"]) ? complete["@type"].join("/") : String(complete["@type"]);
        return { status: "pass", message: `${type} "${String(complete.name)}" declared with url and contact/profile details.` };
      }
      const org = orgs[0]!;
      const missing = [
        org.name === undefined && "name",
        org.url === undefined && "url",
        !hasContact(org) && "contactPoint, email, telephone or sameAs",
      ].filter(Boolean);
      return {
        status: "warn",
        message: `Organization JSON-LD found but incomplete; missing ${missing.join("; ")}.`,
        fixSuggestion: "Complete the Organization block: name, url, and at least one of contactPoint, email, telephone or sameAs (official social/marketplace profiles).",
      };
    },
  },
];

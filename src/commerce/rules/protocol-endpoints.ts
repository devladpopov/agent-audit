import type { CommerceRule } from "../types.js";

/**
 * Current UCP profiles (Shopify, Zara, IKEA, 2026) nest everything under a top-level "ucp" key, next to
 * "signing_keys"; early drafts put version/services at the root. Accept both.
 */
function ucpBody(manifest: any): any {
  return manifest && typeof manifest.ucp === "object" && manifest.ucp !== null ? manifest.ucp : (manifest ?? {});
}

/** services / payment_handlers are maps keyed by reverse-domain name ("dev.ucp.shopping") in the current spec, arrays in early drafts. */
function nonEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v && typeof v === "object" && Object.keys(v).length > 0;
}

/** Where an MCP server card may live: SEP-1649 server card, the older single-file proposal, and the bare path. */
export const MCP_DISCOVERY_PATHS = ["/.well-known/mcp/server-card.json", "/.well-known/mcp.json", "/.well-known/mcp"];

/** RFC 8414 authorization-server metadata, OpenID Connect discovery, RFC 9728 protected-resource metadata. */
export const OAUTH_DISCOVERY_PATHS = [
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/.well-known/oauth-protected-resource",
];

function parseJsonObject(body: string | undefined): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export const protocolEndpointRules: CommerceRule[] = [
  {
    id: "protocol.ucp-manifest",
    category: "protocol-endpoints",
    title: "UCP discovery manifest at /.well-known/ucp",
    weight: 4,
    specUrl: "https://github.com/Universal-Commerce-Protocol/ucp-schema",
    async check(ctx) {
      const probe = await ctx.fetchText("/.well-known/ucp");
      if (!probe.ok) {
        // Scored as "warn" rather than "info": this is the one protocol-endpoints signal we CAN
        // verify objectively, so letting it default to "info" (excluded from scoring) made this
        // whole category silently return 100/100 for every store that has no UCP support at all —
        // caught by the day-3 dataset run (0/20 real stores had a manifest, yet all scored 100 here).
        return {
          status: "warn",
          message: "No /.well-known/ucp manifest found. UCP adoption is still early outside Shopify, so this is a warning, not a failure — but it's the main reason your protocol-endpoints score isn't higher.",
          fixSuggestion: "Publish a UCP manifest at /.well-known/ucp if you want to be discoverable to UCP-based shopping agents.",
        };
      }
      try {
        const manifest = ucpBody(JSON.parse((probe.body ?? "").replace(/^\uFEFF/, "")));
        const hasVersion = manifest.version !== undefined;
        const hasServices = nonEmpty(manifest.services);
        if (hasVersion && hasServices) {
          const services = Array.isArray(manifest.services) ? "" : `; services: ${Object.keys(manifest.services).join(", ")}`;
          return { status: "pass", message: `UCP manifest found (version ${manifest.version}${services}).` };
        }
        return {
          status: "warn",
          message: "UCP manifest found but missing version and/or services fields.",
          fixSuggestion: "Ensure the UCP manifest declares ucp.version and a non-empty ucp.services map per the UCP spec.",
        };
      } catch {
        return {
          status: "fail",
          message: "/.well-known/ucp responded but is not valid JSON.",
          fixSuggestion: "Fix the UCP manifest so it is valid JSON matching the UCP schema.",
        };
      }
    },
  },
  {
    id: "protocol.acp-feed-note",
    category: "protocol-endpoints",
    title: "ACP product feed readiness (best-effort, not publicly verifiable)",
    weight: 1,
    specUrl: "https://developers.openai.com/commerce",
    check() {
      return {
        status: "info",
        message: "ACP feeds are submitted directly to OpenAI, not hosted at a public well-known path, so this scanner cannot verify ACP feed conformance remotely.",
        fixSuggestion: "Validate your feed against the ACP Product Feed Specification (agenticcommerce.pro/specification/feed) before submitting it.",
      };
    },
  },
  {
    id: "protocol.ap2-note",
    category: "protocol-endpoints",
    title: "AP2 payment-mandate awareness",
    weight: 1,
    specUrl: "https://github.com/google-agentic-commerce/AP2",
    check(ctx) {
      const ucp = ctx.wellKnown["/.well-known/ucp"];
      if (ucp?.ok && ucp.body) {
        try {
          const manifest = ucpBody(JSON.parse(ucp.body.replace(/^\uFEFF/, "")));
          const handlers = manifest.paymentHandlers ?? manifest.payment_handlers;
          if (nonEmpty(handlers)) {
            const count = Array.isArray(handlers) ? handlers.length : Object.keys(handlers).length;
            return { status: "pass", message: `UCP manifest declares ${count} payment handler(s), a prerequisite for AP2 mandates.` };
          }
        } catch {
          // ignore — UCP validity is checked by protocol.ucp-manifest
        }
      }
      return {
        status: "info",
        message: "AP2 (payment authorization proof, now under FIDO) is verified at transaction time, not via a static endpoint. No manifest-level payment handlers were confirmed.",
      };
    },
  },
  {
    id: "protocol.mcp-discovery",
    category: "protocol-endpoints",
    title: "MCP server is discoverable",
    weight: 1,
    specUrl: "https://modelcontextprotocol.io/",
    async check(ctx) {
      const probes = await Promise.all(MCP_DISCOVERY_PATHS.map((p) => ctx.fetchText(p)));
      const found = probes.filter((p) => p.ok && p.body);
      for (const probe of found) {
        const doc = parseJsonObject(probe.body);
        if (!doc) continue;
        const info = (doc.serverInfo ?? doc.server_info) as Record<string, unknown> | undefined;
        const name = info?.name ?? doc.name;
        return {
          status: "pass",
          message: `MCP discovery document found at ${probe.path}${typeof name === "string" ? ` (${name})` : ""}.`,
        };
      }
      // UCP manifests can list an MCP transport for their services; that counts as discoverable too.
      const ucp = ctx.wellKnown["/.well-known/ucp"];
      if (ucp?.ok && parseJsonObject(ucp.body) && /"mcp"|\/mcp\b/i.test(ucp.body ?? "")) {
        return { status: "pass", message: "No standalone MCP card, but the UCP manifest references an MCP transport." };
      }
      if (found.length > 0) {
        return {
          status: "warn",
          message: `${found.map((p) => p.path).join(", ")} responded but is not a valid JSON object.`,
          fixSuggestion: "Serve the MCP server card as JSON (application/json) with at least name, version and the endpoint URL.",
        };
      }
      return {
        status: "info",
        message: `No MCP discovery document at ${MCP_DISCOVERY_PATHS.join(", ")}. MCP server cards are still a draft convention, so this is not scored.`,
        fixSuggestion: "If you run an MCP server for your catalog or cart, publish a server card at /.well-known/mcp/server-card.json so agents can find it from your domain.",
      };
    },
  },
  {
    id: "protocol.oauth-discovery",
    category: "protocol-endpoints",
    title: "OAuth/OpenID metadata for delegated agent access",
    weight: 1,
    specUrl: "https://www.rfc-editor.org/rfc/rfc8414.html",
    async check(ctx) {
      const probes = await Promise.all(OAUTH_DISCOVERY_PATHS.map((p) => ctx.fetchText(p)));
      const valid = probes.filter((p) => {
        const doc = p.ok ? parseJsonObject(p.body) : undefined;
        // Authorization-server metadata has an issuer; protected-resource metadata (RFC 9728) has a resource.
        return !!doc && (typeof doc.issuer === "string" || typeof doc.resource === "string");
      });
      if (valid.length > 0) {
        return {
          status: "pass",
          message: `OAuth metadata published at ${valid.map((p) => p.path).join(", ")}. Agents can request delegated, scoped access (account, orders, checkout) instead of scraping a login form.`,
        };
      }
      const broken = probes.filter((p) => p.ok);
      if (broken.length > 0) {
        return {
          status: "warn",
          message: `${broken.map((p) => p.path).join(", ")} responded but is not valid OAuth metadata (JSON with an issuer).`,
          fixSuggestion: "Serve RFC 8414 authorization-server metadata as JSON with issuer, authorization_endpoint and token_endpoint.",
        };
      }
      return {
        status: "info",
        message: "No OAuth/OpenID discovery metadata on the store domain. Only needed if you let agents sign in on a shopper's behalf, so this is not scored.",
        fixSuggestion: "If customers have accounts, publish /.well-known/oauth-authorization-server (RFC 8414) or /.well-known/openid-configuration so agents can use delegated sign-in instead of stored passwords.",
      };
    },
  },
];

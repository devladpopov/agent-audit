import type { Rule } from "../core/types.js";

export const protocolEndpointRules: Rule[] = [
  {
    id: "protocol.ucp-manifest",
    category: "protocol-endpoints",
    title: "UCP discovery manifest at /.well-known/ucp",
    weight: 4,
    specUrl: "https://github.com/Universal-Commerce-Protocol/ucp-schema",
    async check(ctx) {
      const probe = await ctx.fetchText("/.well-known/ucp");
      if (!probe.ok) {
        return {
          status: "info",
          message: "No /.well-known/ucp manifest found (UCP is optional but growing fast among Google/Shopify-connected agents).",
          fixSuggestion: "Publish a UCP manifest at /.well-known/ucp if you want to be discoverable to UCP-based shopping agents.",
        };
      }
      try {
        const manifest = JSON.parse(probe.body ?? "");
        const hasVersion = manifest.version !== undefined;
        const hasServices = Array.isArray(manifest.services) && manifest.services.length > 0;
        if (hasVersion && hasServices) {
          return { status: "pass", message: `UCP manifest found (version ${manifest.version}).` };
        }
        return {
          status: "warn",
          message: "UCP manifest found but missing version and/or services fields.",
          fixSuggestion: "Ensure the UCP manifest declares version and a non-empty services array per the UCP schema.",
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
          const manifest = JSON.parse(ucp.body);
          const handlers = manifest.paymentHandlers ?? manifest.payment_handlers;
          if (Array.isArray(handlers) && handlers.length > 0) {
            return { status: "pass", message: `UCP manifest declares ${handlers.length} payment handler(s), a prerequisite for AP2 mandates.` };
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
];

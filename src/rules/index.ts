import type { Rule } from "../core/types.js";
import { productDataRules } from "./product-data.js";
import { feedsRules } from "./feeds.js";
import { protocolEndpointRules } from "./protocol-endpoints.js";
import { agentAccessRules } from "./agent-access.js";
import { checkoutReadinessRules } from "./checkout-readiness.js";
import { trustSignalRules } from "./trust-signals.js";

/** Full default rule set. A future config file can enable/disable/reweight individual rules by id. */
export const ALL_RULES: Rule[] = [
  ...productDataRules,
  ...feedsRules,
  ...protocolEndpointRules,
  ...agentAccessRules,
  ...checkoutReadinessRules,
  ...trustSignalRules,
];

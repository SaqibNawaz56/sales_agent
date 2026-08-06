/**
 * The tools the LLM is permitted to see.
 *
 * This is an ALLOWLIST, not a denylist, and that is the whole point. The
 * proposal (R7) describes filtering `save_sale` out of the advertised set; an
 * allowlist is strictly stronger, because any tool later added to the MCP
 * server is invisible to the model until someone deliberately names it here.
 * A denylist fails open — forget to add an entry and a write tool silently
 * becomes callable. This fails closed.
 *
 * DEVIATION FROM THE PROPOSAL (§2, "Agent-exposed MCP tools"). The proposal
 * lists lookup_product, create_product and find_or_create_customer as tools the
 * agent calls. They are deliberately absent here. The controller calls all
 * three through its own MCP client, so no price and no catalogue fact ever
 * passes through the model — which makes R3 true by construction rather than by
 * instructing the model not to invent prices.
 *
 * The consequence is that the sale-capture flow advertises no tools at all: the
 * model does extraction only. The three read-only query tools join this set on
 * Day 5, and `health_check` is here as a harmless liveness probe used by the
 * verification scripts.
 *
 * `save_sale` must never appear in this set. It is reached only by the
 * controller's own client, from the confirm endpoint.
 *
 * This constant lives in a file of its own so that the security-relevant line
 * is the entire contents of a file, and any change to it stands alone in a
 * diff rather than hiding among transport plumbing.
 */
export const AGENT_TOOL_ALLOWLIST = new Set<string>(["health_check"]);

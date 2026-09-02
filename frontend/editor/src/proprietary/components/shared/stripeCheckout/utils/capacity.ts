/**
 * Server-plan capacity: one server grants a block of users.
 *
 * The authoritative block size lives on the pricing policy and is resolved server-side when the
 * licence is issued, then baked into licence metadata. Before a purchase there is no licence to read
 * it from, so the checkout needs a display default. Keep it in step with
 * `pricing_policy.server_plan_user_block`; after purchase the licence is what counts, and the admin
 * surfaces read `userBlockSize` off `/license-info` rather than this constant.
 */
export const USERS_PER_SERVER = 100;

/**
 * Servers a buyer can put through self-serve checkout in one go. Past this the enterprise
 * conversation is offered alongside the purchase, never instead of it.
 */
export const SELF_SERVE_MAX_SERVERS = 5;

/** Resulting capacity at which an enterprise quote is also worth offering. */
export const ENTERPRISE_ADVISORY_USERS = 1000;

/** Users covered by a given number of servers. */
export function usersForServers(servers: number): number {
  return Math.max(1, servers) * USERS_PER_SERVER;
}

/**
 * Whether to surface the enterprise door beside the purchase. Deliberately an option rather than a
 * gate: a buyer past these numbers can still complete self-serve checkout.
 */
export function shouldOfferEnterprise(servers: number): boolean {
  return (
    servers >= SELF_SERVE_MAX_SERVERS ||
    usersForServers(servers) >= ENTERPRISE_ADVISORY_USERS
  );
}

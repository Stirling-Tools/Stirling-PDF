/**
 * Team-plan capacity: the plan is sold in blocks of users.
 *
 * A block is what Stripe charges for (one unit of `selfhosted:server:*`), but nothing
 * customer-facing says so: the buyer picks a number of users and the line item prices it per block.
 * Only `server_quantity` on the checkout request speaks in blocks, because that is what the
 * subscription line item counts.
 *
 * The authoritative block size lives on the pricing policy and is resolved server-side when the
 * licence is issued, then baked into licence metadata. Before a purchase there is no licence to read
 * it from, so the checkout needs a display default. Keep it in step with
 * `pricing_policy.server_plan_user_block`; after purchase the licence is what counts, and the admin
 * surfaces read `userBlockSize` off `/license-info` rather than this constant.
 */
export const USERS_PER_BLOCK = 100;

/** Blocks a buyer can put through self-serve checkout in one go. */
export const SELF_SERVE_MAX_BLOCKS = 5;

/** Capacity at which an enterprise quote is also worth offering. */
export const ENTERPRISE_ADVISORY_USERS = 1000;

/** The user counts offered as one-click presets, before "Other". */
export const USER_PRESETS = [100, 200, 300, 400];

/** Users covered by a given number of blocks. */
export function usersForBlocks(blocks: number): number {
  return Math.max(1, blocks) * USERS_PER_BLOCK;
}

/** Blocks needed to cover a given number of users. Always at least one. */
export function blocksForUsers(users: number): number {
  return Math.max(1, Math.ceil(Math.max(0, users) / USERS_PER_BLOCK));
}

/**
 * Whether to surface the enterprise door beside the purchase. Deliberately an option rather than a
 * gate: a buyer past these numbers can still complete self-serve checkout.
 */
export function shouldOfferEnterprise(blocks: number): boolean {
  return (
    blocks >= SELF_SERVE_MAX_BLOCKS ||
    usersForBlocks(blocks) >= ENTERPRISE_ADVISORY_USERS
  );
}

/** Historical packaging; new prices supply their own block size. */
export const USERS_PER_BLOCK = 100;

/** Blocks a buyer can put through self-serve checkout in one go. */
export const SELF_SERVE_MAX_BLOCKS = 5;

/** Capacity at which an enterprise quote is also worth offering. */
export const ENTERPRISE_ADVISORY_USERS = 1000;

/** The block counts offered as one-click presets, before "Custom". */
export const PRESET_BLOCKS = [1, 2, 3, 4];

/** Users covered by a given number of blocks. */
export function usersForBlocks(
  blocks: number,
  blockSize = USERS_PER_BLOCK,
  includedUsers = 0,
): number {
  return includedUsers + Math.max(1, blocks) * blockSize;
}

/** Blocks needed to cover a given number of users. Always at least one. */
export function blocksForUsers(
  users: number,
  blockSize = USERS_PER_BLOCK,
  includedUsers = 0,
): number {
  return Math.max(1, Math.ceil(Math.max(0, users - includedUsers) / blockSize));
}

/**
 * Whether to surface the enterprise door beside the purchase. Deliberately an option rather than a
 * gate: a buyer past these numbers can still complete self-serve checkout.
 */
export function shouldOfferEnterprise(
  blocks: number,
  blockSize = USERS_PER_BLOCK,
  includedUsers = 0,
): boolean {
  return (
    (blockSize === USERS_PER_BLOCK && blocks >= SELF_SERVE_MAX_BLOCKS) ||
    usersForBlocks(blocks, blockSize, includedUsers) >=
      ENTERPRISE_ADVISORY_USERS
  );
}

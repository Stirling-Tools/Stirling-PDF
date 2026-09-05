/**
 * Resolves what an installation's user limit means, and what buying more looks like.
 *
 * Two things make this more than a subtraction. An uncapped licence reports its limit as a
 * sentinel rather than an absence (`Integer.MAX_VALUE` from `calculateMaxAllowedUsers()`, or
 * `0` on some payloads), so unlimited has to be tested before any arithmetic. And a limit can
 * be raised two different ways: Team licences sell blocks of users, Enterprise licences sell
 * individual seats, and the two are told apart by whether the licence carries a server
 * quantity, not by the size of the limit.
 */

/** At or above this, a reported limit is a sentinel rather than a real cap. */
export const UNLIMITED_USER_LIMIT = 100_000;

/** Fraction of the limit at which the count is worth drawing attention to. */
export const NEAR_LIMIT_RATIO = 0.8;

/**
 * How the limit was set, and therefore how it is raised.
 *
 * - `unlimited` - legacy Server licences and Enterprise trials. No arithmetic, no prompt to buy.
 * - `blocks` - Team plans, sold in blocks of {@link UserCapacity.blockSize} users.
 * - `seats` - Enterprise, sold per seat through the existing seat flow.
 * - `free` - no paid licence; the limit is the grandfathered allowance.
 */
export type UserCapacityKind = "unlimited" | "blocks" | "seats" | "free";

export interface UserCapacity {
  kind: UserCapacityKind;
  used: number;
  /** null when {@link kind} is `unlimited`. */
  limit: number | null;
  /** null when {@link kind} is `unlimited`. Never negative. */
  remaining: number | null;
  /** `blocks` only; 0 otherwise. */
  blocks: number;
  /** `blocks` only; 0 otherwise. */
  blockSize: number;
  /**
   * Accounts that hold a slot without appearing in the active roster. Surfaced because
   * otherwise a count higher than the visible list reads as a bug.
   */
  disabled: number;
  pendingInvites: number;
  atCapacity: boolean;
  nearLimit: boolean;
}

export interface UserCapacityInput {
  used: number;
  /** `maxAllowedUsers` as reported by the admin settings endpoint. */
  maxAllowedUsers?: number | null;
  /** Team plans on the licence. Absent or 0 on every licence issued before the cap. */
  serverQuantity?: number | null;
  /** Users each Team plan grants. */
  userBlockSize?: number | null;
  premiumEnabled?: boolean;
  disabled?: number;
  pendingInvites?: number;
}

/** True when the reported limit is a sentinel for "no limit" rather than a real cap. */
export function isUnlimitedUserLimit(max: number | null | undefined): boolean {
  return max == null || max <= 0 || max >= UNLIMITED_USER_LIMIT;
}

export function resolveUserCapacity(input: UserCapacityInput): UserCapacity {
  const used = Math.max(0, Math.trunc(input.used || 0));
  const disabled = Math.max(0, Math.trunc(input.disabled ?? 0));
  const pendingInvites = Math.max(0, Math.trunc(input.pendingInvites ?? 0));
  const base = { used, disabled, pendingInvites };

  if (isUnlimitedUserLimit(input.maxAllowedUsers)) {
    return {
      ...base,
      kind: "unlimited",
      limit: null,
      remaining: null,
      blocks: 0,
      blockSize: 0,
      atCapacity: false,
      nearLimit: false,
    };
  }

  const limit = Math.trunc(input.maxAllowedUsers as number);
  const remaining = Math.max(0, limit - used);
  const blocks = Math.max(0, Math.trunc(input.serverQuantity ?? 0));
  const blockSize = Math.max(0, Math.trunc(input.userBlockSize ?? 0));

  // A Team licence carries both a finite limit and a server quantity; an Enterprise seat licence
  // carries only the limit. Testing seats first would route every Team install into the seat flow.
  const soldInBlocks = blocks > 0 && blockSize > 0;
  const kind: UserCapacityKind = soldInBlocks
    ? "blocks"
    : input.premiumEnabled
      ? "seats"
      : "free";

  return {
    ...base,
    kind,
    limit,
    remaining,
    // Only meaningful for block licences; a half-populated quantity would otherwise read as
    // a plan count on a seat licence.
    blocks: soldInBlocks ? blocks : 0,
    blockSize: soldInBlocks ? blockSize : 0,
    atCapacity: used >= limit,
    nearLimit: used >= limit * NEAR_LIMIT_RATIO,
  };
}

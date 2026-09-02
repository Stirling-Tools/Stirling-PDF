import { describe, expect, it } from "vitest";
import {
  USERS_PER_BLOCK,
  SELF_SERVE_MAX_BLOCKS,
  ENTERPRISE_ADVISORY_USERS,
  usersForBlocks,
  blocksForUsers,
  shouldOfferEnterprise,
} from "@app/components/shared/stripeCheckout/utils/capacity";

describe("usersForBlocks", () => {
  it("multiplies blocks by the block size", () => {
    expect(usersForBlocks(1)).toBe(USERS_PER_BLOCK);
    expect(usersForBlocks(3)).toBe(USERS_PER_BLOCK * 3);
  });

  it("treats a missing quantity as one block", () => {
    // Zero would read as "no capacity" and price the plan at nothing.
    expect(usersForBlocks(0)).toBe(USERS_PER_BLOCK);
    expect(usersForBlocks(-2)).toBe(USERS_PER_BLOCK);
  });
});

describe("blocksForUsers", () => {
  it("rounds a part-full block up", () => {
    expect(blocksForUsers(1)).toBe(1);
    expect(blocksForUsers(USERS_PER_BLOCK)).toBe(1);
    expect(blocksForUsers(USERS_PER_BLOCK + 1)).toBe(2);
    expect(blocksForUsers(240)).toBe(3);
  });

  it("never returns zero blocks", () => {
    // Checkout seeds the picker from this, and a zero would render a blocked stage.
    expect(blocksForUsers(0)).toBe(1);
    expect(blocksForUsers(-5)).toBe(1);
  });

  it("round-trips with usersForBlocks", () => {
    expect(blocksForUsers(usersForBlocks(4))).toBe(4);
  });
});

describe("shouldOfferEnterprise", () => {
  it("stays quiet for a small purchase", () => {
    expect(shouldOfferEnterprise(1)).toBe(false);
    expect(shouldOfferEnterprise(2)).toBe(false);
  });

  it("offers the quote once the purchase reaches the self-serve maximum", () => {
    expect(shouldOfferEnterprise(SELF_SERVE_MAX_BLOCKS)).toBe(true);
  });

  it("offers the quote once the resulting capacity is enterprise-sized", () => {
    const servers = Math.ceil(ENTERPRISE_ADVISORY_USERS / USERS_PER_BLOCK);
    expect(usersForBlocks(servers)).toBeGreaterThanOrEqual(
      ENTERPRISE_ADVISORY_USERS,
    );
    expect(shouldOfferEnterprise(servers)).toBe(true);
  });
});

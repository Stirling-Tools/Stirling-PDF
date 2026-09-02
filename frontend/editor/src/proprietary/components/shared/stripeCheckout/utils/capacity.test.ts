import { describe, expect, it } from "vitest";
import {
  USERS_PER_SERVER,
  SELF_SERVE_MAX_SERVERS,
  ENTERPRISE_ADVISORY_USERS,
  usersForServers,
  serversForUsers,
  shouldOfferEnterprise,
} from "@app/components/shared/stripeCheckout/utils/capacity";

describe("usersForServers", () => {
  it("multiplies servers by the block size", () => {
    expect(usersForServers(1)).toBe(USERS_PER_SERVER);
    expect(usersForServers(3)).toBe(USERS_PER_SERVER * 3);
  });

  it("treats a missing quantity as one server", () => {
    // Zero would read as "no capacity" and price the plan at nothing.
    expect(usersForServers(0)).toBe(USERS_PER_SERVER);
    expect(usersForServers(-2)).toBe(USERS_PER_SERVER);
  });
});

describe("serversForUsers", () => {
  it("rounds part-full servers up", () => {
    expect(serversForUsers(1)).toBe(1);
    expect(serversForUsers(USERS_PER_SERVER)).toBe(1);
    expect(serversForUsers(USERS_PER_SERVER + 1)).toBe(2);
    expect(serversForUsers(240)).toBe(3);
  });

  it("never returns zero servers", () => {
    // Checkout seeds the stepper from this, and a zero would render a blocked stage.
    expect(serversForUsers(0)).toBe(1);
    expect(serversForUsers(-5)).toBe(1);
  });

  it("round-trips with usersForServers", () => {
    expect(serversForUsers(usersForServers(4))).toBe(4);
  });
});

describe("shouldOfferEnterprise", () => {
  it("stays quiet for a small purchase", () => {
    expect(shouldOfferEnterprise(1)).toBe(false);
    expect(shouldOfferEnterprise(2)).toBe(false);
  });

  it("offers the quote once the purchase reaches the self-serve maximum", () => {
    expect(shouldOfferEnterprise(SELF_SERVE_MAX_SERVERS)).toBe(true);
  });

  it("offers the quote once the resulting capacity is enterprise-sized", () => {
    const servers = Math.ceil(ENTERPRISE_ADVISORY_USERS / USERS_PER_SERVER);
    expect(usersForServers(servers)).toBeGreaterThanOrEqual(
      ENTERPRISE_ADVISORY_USERS,
    );
    expect(shouldOfferEnterprise(servers)).toBe(true);
  });
});

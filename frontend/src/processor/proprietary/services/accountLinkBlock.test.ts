import { describe, expect, it } from "vitest";
import { HttpError } from "@portal/api/http";
import { classifyAccountLinkBlock } from "@portal/services/accountLinkBlock";

/**
 * Strict on purpose: an incidental 402 from anywhere else must not be turned into a pitch for an
 * account, and an unknown reason must not be guessed at.
 */
describe("classifyAccountLinkBlock", () => {
  const body = (extra: Record<string, unknown>) =>
    new HttpError(402, "Payment Required", extra);

  it("reads the reason off the gate's sentinel", () => {
    expect(
      classifyAccountLinkBlock(
        body({ error: "ACCOUNT_LINK_REQUIRED", reason: "FREE_TIER_EXHAUSTED" }),
      ),
    ).toBe("FREE_TIER_EXHAUSTED");
    expect(
      classifyAccountLinkBlock(
        body({ error: "ACCOUNT_LINK_REQUIRED", reason: "OVER_LIMIT" }),
      ),
    ).toBe("OVER_LIMIT");
  });

  it("declines a 402 that is not the account-link sentinel", () => {
    expect(
      classifyAccountLinkBlock(body({ error: "FEATURE_DEGRADED" })),
    ).toBeNull();
    expect(classifyAccountLinkBlock(body({}))).toBeNull();
    expect(
      classifyAccountLinkBlock(new HttpError(402, "Payment Required", null)),
    ).toBeNull();
  });

  it("declines the sentinel on any other status", () => {
    expect(
      classifyAccountLinkBlock(
        new HttpError(403, "Forbidden", {
          error: "ACCOUNT_LINK_REQUIRED",
          reason: "FREE_TIER_EXHAUSTED",
        }),
      ),
    ).toBeNull();
  });

  it("declines a reason it does not know, rather than guessing", () => {
    expect(
      classifyAccountLinkBlock(
        body({ error: "ACCOUNT_LINK_REQUIRED", reason: "FLAG_OFF" }),
      ),
    ).toBeNull();
    expect(
      classifyAccountLinkBlock(
        body({ error: "ACCOUNT_LINK_REQUIRED", reason: 7 }),
      ),
    ).toBeNull();
  });

  it("declines anything that is not an error shape at all", () => {
    expect(classifyAccountLinkBlock(null)).toBeNull();
    expect(classifyAccountLinkBlock("402")).toBeNull();
    expect(classifyAccountLinkBlock(new Error("network"))).toBeNull();
  });
});

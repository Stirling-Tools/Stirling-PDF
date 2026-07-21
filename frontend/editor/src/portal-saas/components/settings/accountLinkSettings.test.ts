import { describe, expect, it } from "vitest";
import { accountLinkSettings } from "@portal/components/settings/accountLinkSettings";

describe("accountLinkSettings (SaaS)", () => {
  it("is null — Settings has no account-link section on SaaS", () => {
    expect(accountLinkSettings).toBeNull();
  });
});

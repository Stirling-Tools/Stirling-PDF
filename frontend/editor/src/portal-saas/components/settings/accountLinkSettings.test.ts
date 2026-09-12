import { describe, expect, it } from "vitest";
import { accountLinkSettings } from "@portal/components/settings/accountLinkSettings";

describe("accountLinkSettings (SaaS)", () => {
  it("omits the self-hosted linking flow on SaaS", () => {
    expect(accountLinkSettings).toBeNull();
  });
});

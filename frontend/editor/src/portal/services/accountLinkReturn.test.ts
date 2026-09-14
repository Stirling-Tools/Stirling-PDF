import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeAccountLinkReturn,
  rememberAccountLinkReturn,
} from "@portal/services/accountLinkReturn";

describe("return from account linking", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns to the originating Processor route once without retaining fragments", () => {
    rememberAccountLinkReturn("/processor/pipelines?selected=12#private");
    expect(consumeAccountLinkReturn()).toBe("/processor/pipelines?selected=12");
    expect(consumeAccountLinkReturn()).toBe("/processor");
  });

  it.each([
    "https://example.com/processor",
    "//example.com/processor",
    "/processor/../../login",
    "/processor-evil",
  ])("rejects an unsafe stored route: %s", (path) => {
    sessionStorage.setItem("stirling.accountLinkReturnPath", path);
    expect(consumeAccountLinkReturn()).toBe("/processor");
  });

  it("returns settings-originated links to Processor where the callback can be completed", () => {
    rememberAccountLinkReturn("/settings/billing");
    expect(consumeAccountLinkReturn()).toBe("/processor");
  });
});

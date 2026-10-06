import { afterEach, describe, expect, it, vi } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";
import { openStripePage, stripePageHref } from "@app/platform/stripeNavigation";

afterEach(() => vi.restoreAllMocks());

describe("stripePageHref", () => {
  it.each([
    "https://checkout.stripe.com/c/pay/cs_test_1",
    "https://billing.stripe.com/p/session/abc",
    "https://invoice.stripe.com/i/acct_1/inv_1",
  ])("accepts Stripe's hosted page %s", (url) => {
    expect(stripePageHref(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://checkout.stripe.com/c/pay/cs_test_1",
    "https://evil.example/checkout",
    "https://stripe.com.evil.example/",
    "https://user@billing.stripe.com/p/session/abc",
    "not a url",
  ])("refuses %s", (url) => {
    expect(stripePageHref(url)).toBeNull();
  });
});

describe("openStripePage", () => {
  it("opens a Stripe page in a tab", () => {
    const open = vi
      .spyOn(window, "open")
      .mockImplementation(() => ({ opener: null }) as Window);

    expect(
      openStripePage("https://billing.stripe.com/p/session/abc", "tab"),
    ).toBe(true);
    expect(open).toHaveBeenCalledWith(
      "https://billing.stripe.com/p/session/abc",
      "_blank",
    );
  });

  it("goes nowhere for an address that is not Stripe's", () => {
    expectConsole.warn(/refused to open/);
    const open = vi.spyOn(window, "open");

    expect(openStripePage("javascript:alert(1)", "tab")).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});

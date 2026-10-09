import { beforeEach, expect, it, vi } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";

const h = vi.hoisted(() => ({
  openExternal: vi.fn(),
  handoff: vi.fn(),
  cancel: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("@app/platform/openExternal", () => ({ openExternal: h.openExternal }));
vi.mock("@app/services/billingReturn", () => ({
  noteBillingHandoff: h.handoff,
  cancelBillingHandoff: h.cancel,
}));
vi.mock("@app/components/toast", () => ({ alert: h.alert }));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_FRONTEND_URL: "https://stirling.example/app",
}));

import {
  openStripePage,
  stripeCheckoutFallbackUrl,
} from "@app/platform/stripeNavigation";

beforeEach(() => {
  h.openExternal.mockReset().mockResolvedValue(undefined);
  h.handoff.mockReset();
  h.cancel.mockReset();
  h.alert.mockReset();
});

it("hands a Stripe page to the system browser and watches for the return", () => {
  openStripePage("https://checkout.stripe.com/c/pay/cs_test_1");
  expect(h.openExternal).toHaveBeenCalledWith(
    "https://checkout.stripe.com/c/pay/cs_test_1",
  );
  expect(h.handoff).toHaveBeenCalledOnce();
});

it("also opens the web app's own fallback for finishing a purchase", () => {
  openStripePage(stripeCheckoutFallbackUrl()!);
  expect(h.openExternal).toHaveBeenCalledWith(
    "https://stirling.example/app/settings/billing",
  );
});

it.each([
  "https://evil.example/app/settings/billing",
  "https://stirling.example/app/settings/account",
])("opens nothing else, such as %s", (url) => {
  expectConsole.warn(/refused to open/);
  openStripePage(url);
  expect(h.openExternal).not.toHaveBeenCalled();
  expect(h.handoff).not.toHaveBeenCalled();
});

it("says so, and stops waiting for a return, when the browser does not open", async () => {
  expectConsole.error(/could not open the system browser/);
  h.openExternal.mockRejectedValue(new Error("no handler"));

  openStripePage("https://checkout.stripe.com/c/pay/cs_test_1");

  await vi.waitFor(() => expect(h.cancel).toHaveBeenCalledOnce());
  expect(h.alert).toHaveBeenCalledWith(
    expect.objectContaining({ alertType: "error" }),
  );
});

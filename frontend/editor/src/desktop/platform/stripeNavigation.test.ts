import { beforeEach, expect, it, vi } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";

const h = vi.hoisted(() => ({ openExternal: vi.fn(), handoff: vi.fn() }));
vi.mock("@app/platform/openExternal", () => ({ openExternal: h.openExternal }));
vi.mock("@app/services/billingReturn", () => ({
  noteBillingHandoff: h.handoff,
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_FRONTEND_URL: "https://stirling.example/app",
}));

import {
  openStripePage,
  stripeCheckoutFallbackUrl,
} from "@app/platform/stripeNavigation";

beforeEach(() => {
  h.openExternal.mockReset();
  h.handoff.mockReset();
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

it("opens nothing else", () => {
  expectConsole.warn(/refused to open/);
  openStripePage("https://evil.example/app/settings/billing");
  expect(h.openExternal).not.toHaveBeenCalled();
  expect(h.handoff).not.toHaveBeenCalled();
});

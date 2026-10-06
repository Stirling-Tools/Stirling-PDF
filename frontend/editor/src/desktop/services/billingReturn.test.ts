import { beforeEach, expect, it, vi } from "vitest";
import { STRIPE_RETURN_EVENT } from "@app/constants/billingEvents";

const h = vi.hoisted(() => ({
  deepLink: null as ((event: { payload: string }) => void) | null,
  focus: null as ((event: { payload: boolean }) => void) | null,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_name: string, handler: (event: { payload: string }) => void) => {
    h.deepLink = handler;
    return Promise.resolve(() => {});
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: (event: { payload: boolean }) => void) => {
      h.focus = handler;
      return Promise.resolve(() => {});
    },
  }),
}));

import { noteBillingHandoff } from "@app/services/billingReturn";

const returns: string[] = [];
beforeEach(() => {
  returns.length = 0;
  window.addEventListener(STRIPE_RETURN_EVENT, (event) =>
    returns.push((event as CustomEvent<string>).detail),
  );
});

it("refreshes on the first return to the window, not on every focus after it", () => {
  noteBillingHandoff();

  h.focus!({ payload: false });
  h.focus!({ payload: true });
  h.focus!({ payload: true });
  expect(returns).toEqual([""]);

  // The deep link still reports how checkout ended.
  h.deepLink!({
    payload: "stirlingpdf://billing/return?payment_status=success",
  });
  expect(returns).toEqual(["", "?payment_status=success"]);
});

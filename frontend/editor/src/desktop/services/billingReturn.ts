import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DESKTOP_BILLING_RETURN,
  STRIPE_RETURN_EVENT,
} from "@app/constants/billingEvents";

let listening = false;
let handoffPending = false;

function announceReturn(search: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(STRIPE_RETURN_EVENT, { detail: search }),
  );
  // Usage and the wallet readers refresh on this; the purchase may have changed them.
  window.dispatchEvent(new Event("stirling:billing-updated"));
}

/**
 * Desktop opens Stripe in the system browser, so the app learns how it ended
 * from the deep link the web app's /desktop/return page opens. A user who
 * closes the browser instead never triggers it, so the first return to the
 * window after a handoff refreshes too. Listens from the first handoff onwards.
 */
export function noteBillingHandoff(): void {
  handoffPending = true;
  if (listening) return;
  listening = true;
  void listen<string>("deep-link", (event) => {
    if (!event.payload?.startsWith(DESKTOP_BILLING_RETURN)) return;
    handoffPending = false;
    announceReturn(new URL(event.payload).search);
  });
  void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (!focused || !handoffPending) return;
    handoffPending = false;
    announceReturn("");
  });
}

/** For a handoff whose browser never opened: there is nothing to come back from. */
export function cancelBillingHandoff(): void {
  handoffPending = false;
}

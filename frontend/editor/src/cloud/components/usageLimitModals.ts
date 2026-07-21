/**
 * Imperative API for the usage-limit warning modals.
 *
 * Call these from anywhere (React or not) to pop a modal. They bridge to the
 * always-mounted {@link ./UsageLimitModalHost} host via a window event. No
 * arguments and no context plumbing: the modal reads the live wallet itself to
 * fill in the usage figures.
 *
 *   import { openFreeLimitModal } from "@app/components/usageLimitModals";
 *   openFreeLimitModal();
 */

// Internal bridge events, not part of the public API. Use the helpers below.
export const FREE_LIMIT_MODAL_EVENT = "stirling:open-free-limit-modal";
export const SPEND_CAP_MODAL_EVENT = "stirling:open-spend-cap-modal";

/** Open the "free limit reached" modal. Figures come from the live wallet. */
export function openFreeLimitModal(): void {
  window.dispatchEvent(new Event(FREE_LIMIT_MODAL_EVENT));
}

/** Open the "spend cap reached" modal. Figures come from the live wallet. */
export function openSpendCapModal(): void {
  window.dispatchEvent(new Event(SPEND_CAP_MODAL_EVENT));
}

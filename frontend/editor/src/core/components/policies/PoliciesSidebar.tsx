/**
 * Core stubs for the right-rail Policies UI.
 *
 * The real implementations live in {@code proprietary/components/policies/PoliciesSidebar.tsx}
 * and shadow these stubs via the {@code @app/*} alias cascade when the proprietary
 * build is active. Core builds render nothing, so the right rail shows only the
 * tool list unchanged.
 */

import type { ReactNode } from "react";

/** Whether the right rail should host the Policies section. False in core. */
export function usePoliciesEnabled(): boolean {
  return false;
}

/** Whether the Policies list should appear for the current user. False in core. */
export function usePoliciesVisible(): boolean {
  return false;
}

/**
 * Whether a policy is open (its detail should take over the rail). Always false
 * in core; proprietary bridges to the policy-selection store.
 */
export function usePolicyDetailActive(): boolean {
  return false;
}

/** Collapsible policy list rendered above the Tools section. Null in core. */
export function PoliciesSection(_props: { leadingControl?: ReactNode } = {}) {
  return null;
}

/** Open-policy detail/wizard/settings that replaces the tool area. Null in core. */
export function PolicyDetailTakeover() {
  return null;
}

/** Collapsed-rail policy icons. Null in core; proprietary renders the rail. */
export function PoliciesCollapsedButton(_props: { onExpand: () => void }) {
  return null;
}

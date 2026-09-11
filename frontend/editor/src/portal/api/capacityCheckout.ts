import type { ReactNode } from "react";

/**
 * Per-flavor host for buying user capacity from the portal.
 *
 * The portal mounts as a sibling of the editor's `AppProviders`, not inside it, so nothing
 * in the editor's provider stack is in scope here. Self-hosted capacity is bought through
 * the editor's `CheckoutProvider`, which the self-hosted build therefore has to mount for
 * itself. SaaS buys capacity a different way and mounts nothing.
 *
 * Resolved at build time via the `@app/*` alias, same as `usersBackend`:
 * `src/proprietary/portal/capacityCheckout.tsx` (self-hosted) and
 * `src/saas/portal/capacityCheckout.tsx` (SaaS). This module is just the shared contract.
 */
export type CapacityCheckoutProviderComponent = (props: {
  children: ReactNode;
}) => ReactNode;

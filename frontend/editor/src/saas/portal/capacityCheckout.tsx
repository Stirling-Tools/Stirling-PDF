import type { CapacityCheckoutProviderComponent } from "@portal/api/capacityCheckout";

/**
 * SaaS build: capacity is not bought through the self-hosted licence checkout, so nothing is
 * mounted and the Users page renders its capacity line without an action.
 */
export const CapacityCheckoutProvider: CapacityCheckoutProviderComponent = ({
  children,
}) => children;

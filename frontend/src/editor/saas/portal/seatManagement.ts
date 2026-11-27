import type { SeatManagement } from "@processor/api/seatManagement";
import { useCheckoutOptional } from "@editor/contexts/CheckoutContext";

/** Team capacity uses the same checkout from the roster and billing page. */
export function useSeatManagement(): SeatManagement {
  const checkout = useCheckoutOptional();
  return {
    available: checkout !== null,
    busy: checkout?.isLoading ?? false,
    open: (onChanged) =>
      void checkout?.openCheckout("server", {
        combinedChoose: true,
        onSuccess: onChanged,
      }),
  };
}

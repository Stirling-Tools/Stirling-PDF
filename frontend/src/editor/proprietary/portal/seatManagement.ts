import { useOptionalUpdateSeats } from "@editor/contexts/UpdateSeatsContext";
import { useOptionalLicense } from "@editor/contexts/LicenseContext";
import type { SeatManagement } from "@processor/api/seatManagement";
import { useCheckoutOptional } from "@editor/contexts/CheckoutContext";

/** Team capacity uses account billing; Enterprise retains its licence seat picker. */
export function useSeatManagement(): SeatManagement {
  const checkout = useCheckoutOptional();
  const seats = useOptionalUpdateSeats();
  const info = useOptionalLicense()?.licenseInfo;
  if (
    info &&
    (info.enabled || info.licenseType === "NORMAL") &&
    info.licenseType !== "ENTERPRISE" &&
    info.maxUsers > 0 &&
    checkout
  ) {
    return {
      available: true,
      busy: checkout.isLoading,
      open: (onChanged) =>
        void checkout.openCheckout("server", {
          combinedChoose: true,
          onSuccess: onChanged,
        }),
    };
  }
  const available =
    seats !== undefined &&
    info?.enabled === true &&
    info.licenseType === "ENTERPRISE" &&
    info.maxUsers > 0;
  return {
    available,
    busy: seats?.isLoading ?? false,
    open: (onChanged) => void seats?.openUpdateSeats({ onSuccess: onChanged }),
  };
}

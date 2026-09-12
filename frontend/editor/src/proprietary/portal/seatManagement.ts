import { useOptionalUpdateSeats } from "@app/contexts/UpdateSeatsContext";
import { useOptionalLicense } from "@app/contexts/LicenseContext";
import type { SeatManagement } from "@portal/api/seatManagement";

/**
 * Self-hosted: the seat picker behind UpdateSeatsProvider. Only an Enterprise
 * licence is seat-metered, so every other licence type reports unavailable, as
 * does a host that mounts the roster without the seat provider.
 */
export function useSeatManagement(): SeatManagement {
  const seats = useOptionalUpdateSeats();
  const license = useOptionalLicense();
  const available =
    seats !== undefined && license?.licenseInfo?.licenseType === "ENTERPRISE";
  return {
    available,
    busy: seats?.isLoading ?? false,
    open: (onChanged) => void seats?.openUpdateSeats({ onSuccess: onChanged }),
  };
}

import { useOptionalUpdateSeats } from "@app/contexts/UpdateSeatsContext";
import { useOptionalLicense } from "@app/contexts/LicenseContext";
import type { SeatManagement } from "@portal/api/seatManagement";

/** Licence types sold with a seat count, i.e. the ones seats can be bought for.
 *  SERVER is the licence behind the plan the pricing page calls "Team". */
const SEATED_LICENCES = new Set(["SERVER", "ENTERPRISE"]);

/** Self-hosted: the seat picker, offered to the plans that sell seats. A free
 *  licence upgrades instead; `maxUsers: 0` is legacy unlimited, nothing to raise. */
export function useSeatManagement(): SeatManagement {
  const seats = useOptionalUpdateSeats();
  const info = useOptionalLicense()?.licenseInfo;
  const available =
    seats !== undefined &&
    info?.enabled === true &&
    SEATED_LICENCES.has(info.licenseType) &&
    info.maxUsers > 0;
  return {
    available,
    busy: seats?.isLoading ?? false,
    open: (onChanged) => void seats?.openUpdateSeats({ onSuccess: onChanged }),
  };
}

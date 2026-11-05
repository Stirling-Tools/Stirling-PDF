import type { SeatManagement } from "@processor/api/seatManagement";

/** SaaS: seats follow the subscription and change in billing, not the roster;
 *  UpdateSeatsProvider is not mounted here. */
export function useSeatManagement(): SeatManagement {
  return { available: false, busy: false, open: () => {} };
}

import type { SeatManagement } from "@portal/api/seatManagement";

/** Hosted edition: seats follow the subscription and change in billing, not the roster;
 *  UpdateSeatsProvider is not mounted here. */
export function useSeatManagement(): SeatManagement {
  return { available: false, busy: false, open: () => {} };
}

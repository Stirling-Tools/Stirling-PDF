import type { SeatManagement } from "@portal/api/seatManagement";

/**
 * SaaS: seats follow the subscription, changed in billing rather than from the
 * roster, and UpdateSeatsProvider is not mounted here.
 */
export function useSeatManagement(): SeatManagement {
  return { available: false, busy: false, open: () => {} };
}

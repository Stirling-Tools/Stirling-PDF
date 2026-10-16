/** Whether this build can change the licensed seat count in-app, and how to start
 *  that. Resolved at build time via `@app/portal/seatManagement`. */
export interface SeatManagement {
  /** False when the deployment has no in-app seat flow; hide the control. */
  available: boolean;
  /** A seat change is being started (the billing redirect is in flight). */
  busy: boolean;
  /** Open the seat picker. `onChanged` runs only after seats actually change. */
  open: (onChanged: () => void) => void;
}

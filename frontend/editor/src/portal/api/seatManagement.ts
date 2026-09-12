/**
 * Whether this build can change the licensed seat count from inside the app,
 * and how to start that. Self-hosted Enterprise opens a seat picker and returns
 * via the billing portal; SaaS has no in-app equivalent, so it reports
 * unavailable and the Users page omits the control rather than showing a dead
 * one. Resolved at build time via `@app/portal/seatManagement`.
 */
export interface SeatManagement {
  /** False when the deployment has no in-app seat flow; hide the control. */
  available: boolean;
  /** A seat change is being started (the billing redirect is in flight). */
  busy: boolean;
  /** Open the seat picker. `onChanged` runs only after seats actually change. */
  open: (onChanged: () => void) => void;
}

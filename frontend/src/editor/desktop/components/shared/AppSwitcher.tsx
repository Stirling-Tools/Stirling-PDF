/**
 * Desktop inherits proprietary's layers but does not ship the portal (see
 * desktop/routes/adminRouteExtensions), so shadow the switcher back to empty —
 * otherwise the desktop bundle would reference @processor via the proprietary
 * switcher's imports.
 */
export function AppSwitcher() {
  return null;
}

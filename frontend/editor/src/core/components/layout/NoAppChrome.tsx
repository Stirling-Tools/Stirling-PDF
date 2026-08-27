import { Outlet } from "react-router-dom";
import { useSuppressQuickNavRail } from "@app/contexts/QuickNavHostContext";

/**
 * Layout route for the pages that are not the app - the login form, an invite, a
 * shared link. They sit inside the frame because they need the same backend
 * providers the app does, but they are not somewhere the navigation bar applies:
 * there is nothing to navigate to yet, and the account it would show may not be
 * yours any more.
 */
export function NoAppChrome() {
  useSuppressQuickNavRail();
  return <Outlet />;
}

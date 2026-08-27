import { Outlet } from "react-router-dom";
import { useSuppressQuickNavRail } from "@app/contexts/QuickNavHostContext";

/**
 * Layout route for the pages that aren't the app. They sit inside the frame because
 * they need the same backend providers, but there is nothing to navigate to yet and
 * the account the bar would show may not be yours any more.
 */
export function NoAppChrome() {
  useSuppressQuickNavRail();
  return <Outlet />;
}

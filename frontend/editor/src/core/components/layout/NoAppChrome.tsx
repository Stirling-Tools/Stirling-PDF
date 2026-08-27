import { Outlet } from "react-router-dom";
import { useSuppressQuickNavRail } from "@app/contexts/QuickNavHostContext";

/**
 * The pages that aren't the app. Inside the frame for its providers, but with nothing
 * to navigate to and an account that may not be yours any more.
 */
export function NoAppChrome() {
  useSuppressQuickNavRail();
  return <Outlet />;
}

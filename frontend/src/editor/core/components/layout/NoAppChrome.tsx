import { Outlet } from "react-router-dom";
import { useSuppressQuickNavRail } from "@app/contexts/QuickNavHostContext";

/** Pages that aren't the app: inside the frame for its providers, but with no rail. */
export function NoAppChrome() {
  useSuppressQuickNavRail();
  return <Outlet />;
}

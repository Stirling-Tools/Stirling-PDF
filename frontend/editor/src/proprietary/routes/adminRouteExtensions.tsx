import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";
import { HAS_PROCESSOR } from "@app/routes/hasProcessor";

const ProcessorApp = HAS_PROCESSOR
  ? lazy(async () => {
      const m = await import("@processor/ProcessorApp");
      return { default: m.ProcessorApp };
    })
  : null;

/**
 * Return leg of the account-link handshake, which Stirling redirects to with the admin's session in the URL fragment.
 */
const ConnectCallback = HAS_PROCESSOR
  ? lazy(async () => {
      const m = await import("@processor/views/ConnectCallback");
      return { default: m.default };
    })
  : null;

/** The processor mounts as an admin-only route-set at PROCESSOR_BASENAME (/processor/*). */
export function getAdminRouteExtensions(): ReactElement[] {
  if (!ProcessorApp || !ConnectCallback) return [];
  return [
    <Route
      key="processor"
      path={`${PROCESSOR_BASENAME}/*`}
      element={<ProcessorApp />}
    />,
    <Route
      key="account-link-callback"
      path="/account-link/callback"
      element={<ConnectCallback />}
    />,
  ];
}

import { PortalAuthBoundary } from "@processor/auth/PortalAuthBoundary";
import { PortalFrame } from "@processor/PortalFrame";
import { PortalProviders } from "@processor/PortalProviders";

/**
 * The portal, mounted as a route-set under /processor/* inside the editor app
 * (via the admin-route seam). Session-wide state (auth, app config, licence,
 * tool registry) comes from the PlatformProviders above the frame; this adds
 * only what the portal owns, and NOT a router — the editor's <BrowserRouter> is
 * the one and only router; the portal's routes are relative to the /processor
 * mount (see ViewRouter).
 *
 * The provider stack itself is a per-flavor seam (see {@link PortalProviders}):
 * self-hosted mounts the account-link layer, SaaS does not.
 */
export function PortalApp() {
  return (
    <PortalFrame>
      <PortalAuthBoundary>
        <PortalProviders />
      </PortalAuthBoundary>
    </PortalFrame>
  );
}

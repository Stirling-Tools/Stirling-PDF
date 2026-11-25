import { PortalProviders as CloudPortalProviders } from "@processor-cloud/PortalProviders";
import UserbackWidget from "@editor/components/feedback/UserbackWidget";

/** Web SaaS: the Stirling Cloud stack plus the feedback widget, which the desktop app does not load. */
export function PortalProviders() {
  return (
    <CloudPortalProviders>
      <UserbackWidget />
    </CloudPortalProviders>
  );
}

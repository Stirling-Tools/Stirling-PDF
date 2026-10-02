import { fetchAppConfig } from "@app/api/config";
import {
  AppConfigProvider,
  type AppConfigProviderProps,
} from "@app/contexts/AppConfigContext";
import { connectedServerBaseUrl } from "@app/services/connectedServerBaseUrl";

// On Stirling Cloud the editor's config is the bundled backend's; the processor's is the cloud's.
function fetchConnectedServerConfig() {
  return fetchAppConfig(connectedServerBaseUrl());
}

export function PortalAppConfigProvider(
  props: Omit<AppConfigProviderProps, "fetchConfig">,
) {
  return (
    <AppConfigProvider {...props} fetchConfig={fetchConnectedServerConfig} />
  );
}

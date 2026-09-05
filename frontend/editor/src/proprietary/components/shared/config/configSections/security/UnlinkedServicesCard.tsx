import { Stack } from "@mantine/core";
import ProviderCard from "@app/components/shared/config/configSections/ProviderCard";
import type { Provider } from "@app/components/shared/config/configSections/providerDefinitions";
import {
  getProviderSettings,
  updateProviderSettings,
} from "@app/components/shared/config/configSections/security/connectionProviders";
import type { ConnectionsCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

interface UnlinkedServicesCardProps extends ConnectionsCardProps {
  /** Providers with nothing configured yet, filtered by the page. */
  providers: Provider[];
}

export function UnlinkedServicesCard({
  settings,
  setSettings,
  loginEnabled,
  providers,
}: UnlinkedServicesCardProps) {
  return (
    <Stack gap="sm">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isConfigured={false}
          settings={getProviderSettings(settings, provider)}
          onChange={(updatedSettings) =>
            updateProviderSettings(
              settings,
              setSettings,
              provider,
              updatedSettings,
            )
          }
          disabled={!loginEnabled}
        />
      ))}
    </Stack>
  );
}

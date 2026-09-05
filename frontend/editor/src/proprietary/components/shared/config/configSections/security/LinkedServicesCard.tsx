import { Stack } from "@mantine/core";
import ProviderCard from "@app/components/shared/config/configSections/ProviderCard";
import type { Provider } from "@app/components/shared/config/configSections/providerDefinitions";
import {
  getProviderSettings,
  updateProviderSettings,
} from "@app/components/shared/config/configSections/security/connectionProviders";
import type { ConnectionsCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

interface LinkedServicesCardProps extends ConnectionsCardProps {
  /** Already-configured providers, filtered by the page. */
  providers: Provider[];
}

export function LinkedServicesCard({
  settings,
  setSettings,
  loginEnabled,
  providers,
}: LinkedServicesCardProps) {
  return (
    <Stack gap="sm">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isConfigured={true}
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

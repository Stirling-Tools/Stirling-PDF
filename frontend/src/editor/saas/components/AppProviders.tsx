import { AppProviders as ProprietaryAppProviders } from "@editor-proprietary/components/AppProviders";
import { AppProvidersProps } from "@editor-core/components/AppProviders";
import { SaaSTeamProvider } from "@editor/contexts/SaaSTeamContext";

export function AppProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: AppProvidersProps) {
  return (
    <ProprietaryAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <SaaSTeamProvider>{children}</SaaSTeamProvider>
    </ProprietaryAppProviders>
  );
}

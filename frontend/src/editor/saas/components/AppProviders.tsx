import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { AppProvidersProps } from "@core/components/AppProviders";
import { SaaSTeamProvider } from "@app/contexts/SaaSTeamContext";

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

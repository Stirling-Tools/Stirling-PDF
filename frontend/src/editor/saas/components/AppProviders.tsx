import { AppProviders as ProprietaryAppProviders } from "@editor-proprietary/components/AppProviders";
import { AppProvidersProps } from "@editor-core/components/AppProviders";
import { SaaSTeamProvider } from "@editor/contexts/SaaSTeamContext";

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ProprietaryAppProviders>
      <SaaSTeamProvider>{children}</SaaSTeamProvider>
    </ProprietaryAppProviders>
  );
}

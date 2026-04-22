import {
  AppProviders as CoreAppProviders,
  AppProvidersProps,
} from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { ServerExperienceProvider } from "@app/contexts/ServerExperienceContext";

export function AppProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: AppProvidersProps) {
  return (
    <CoreAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <AuthProvider>
        <LicenseProvider>
          <ServerExperienceProvider>
            {children}
          </ServerExperienceProvider>
        </LicenseProvider>
      </AuthProvider>
    </CoreAppProviders>
  );
}

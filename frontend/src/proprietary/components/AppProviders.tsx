import { AppProviders as CoreAppProviders, AppProvidersProps } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";
import { UpgradeBannerInitializer } from "./shared/UpgradeBannerInitializer";
import { ServerExperienceProvider } from "@app/contexts/ServerExperienceContext";

export function AppProviders({ children, appConfigRetryOptions, appConfigProviderProps }: AppProvidersProps) {
  return (
    <CoreAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <AuthProvider>
        <LicenseProvider>
          <ServerExperienceProvider>
            <CheckoutProvider>
              <UpgradeBannerInitializer />
              {children}
            </CheckoutProvider>
          </ServerExperienceProvider>
        </LicenseProvider>
      </AuthProvider>
    </CoreAppProviders>
  );
}

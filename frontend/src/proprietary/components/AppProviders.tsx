import { AppProviders as CoreAppProviders, AppProvidersProps } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";
import { UpdateSeatsProvider } from "@app/contexts/UpdateSeatsContext";
import UpgradeBanner from "@app/components/shared/UpgradeBanner";

export function AppProviders({ children, appConfigRetryOptions, appConfigProviderProps }: AppProvidersProps) {
  return (
    <CoreAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <AuthProvider>
        <LicenseProvider>
          <CheckoutProvider>
            <UpdateSeatsProvider>
              <UpgradeBanner />
              {children}
            </UpdateSeatsProvider>
          </CheckoutProvider>
        </LicenseProvider>
      </AuthProvider>
    </CoreAppProviders>
  );
}

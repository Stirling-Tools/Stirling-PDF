import { AppProviders as CoreAppProviders, AppProvidersProps } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";
import UpgradeBanner from "@app/components/shared/UpgradeBanner";

export function AppProviders({ children, appConfigRetryOptions, appConfigProviderProps }: AppProvidersProps) {
  return (
    <CoreAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <AuthProvider>
        <CheckoutProvider>
          <UpgradeBanner />
          {children}
        </CheckoutProvider>
      </AuthProvider>
    </CoreAppProviders>
  );
}

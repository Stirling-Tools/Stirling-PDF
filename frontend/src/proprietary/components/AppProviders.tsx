import { AppProviders as CoreAppProviders, AppProvidersProps } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";

export function AppProviders({ children, appConfigRetryOptions }: AppProvidersProps) {
  return (
    <CoreAppProviders appConfigRetryOptions={appConfigRetryOptions}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </CoreAppProviders>
  );
}

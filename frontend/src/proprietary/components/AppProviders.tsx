import { AppProviders as CoreAppProviders, AppProvidersProps } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";

export function AppProviders({ children, appConfigRetryOptions, appConfigProviderProps }: AppProvidersProps) {
  return (
    <CoreAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <AuthProvider>
        {children}
      </AuthProvider>
    </CoreAppProviders>
  );
}

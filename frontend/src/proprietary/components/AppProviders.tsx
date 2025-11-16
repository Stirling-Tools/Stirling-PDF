import { AppProviders as CoreAppProviders, AppProvidersProps } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";
import { UserSettingsSyncProvider } from "@app/components/UserSettingsSyncProvider";

export function AppProviders({ children, appConfigRetryOptions, appConfigProviderProps }: AppProvidersProps) {
  return (
    <CoreAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <AuthProvider>
        <UserSettingsSyncProvider>
          {children}
        </UserSettingsSyncProvider>
      </AuthProvider>
    </CoreAppProviders>
  );
}

import {
  AppProviders as CoreAppProviders,
  AppProvidersProps,
} from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";
import { UpgradeBannerInitializer } from "@app/components/shared/UpgradeBannerInitializer";
import { ServerExperienceProvider } from "@app/contexts/ServerExperienceContext";
import { UpdateSeatsProvider } from "@app/contexts/UpdateSeatsContext";
import { ChatProvider } from "@app/components/chat/ChatContext";

export function AppProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: AppProvidersProps) {
  return (
    <AuthProvider>
      <CoreAppProviders
        appConfigRetryOptions={appConfigRetryOptions}
        appConfigProviderProps={appConfigProviderProps}
      >
        <LicenseProvider>
          <UpdateSeatsProvider>
            <ServerExperienceProvider>
              <CheckoutProvider>
                <UpgradeBannerInitializer />
                <ChatProvider>{children}</ChatProvider>
              </CheckoutProvider>
            </ServerExperienceProvider>
          </UpdateSeatsProvider>
        </LicenseProvider>
      </CoreAppProviders>
    </AuthProvider>
  );
}

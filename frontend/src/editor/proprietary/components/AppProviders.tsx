import {
  AppProviders as CoreAppProviders,
  AppProvidersProps,
} from "@core/components/AppProviders";
import { AuthProvider } from "@editor/auth/UseSession";
import { LicenseProvider } from "@editor/contexts/LicenseContext";
import { CheckoutProvider } from "@editor/contexts/CheckoutContext";
import { UpgradeBannerInitializer } from "@editor/components/shared/UpgradeBannerInitializer";
import { ServerExperienceProvider } from "@editor/contexts/ServerExperienceContext";
import { UpdateSeatsProvider } from "@editor/contexts/UpdateSeatsContext";
import { ChatProvider } from "@editor/components/chat/ChatContext";

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

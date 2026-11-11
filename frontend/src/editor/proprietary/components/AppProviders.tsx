import {
  AppProviders as CoreAppProviders,
  AppProvidersProps,
} from "@editor-core/components/AppProviders";
import { CheckoutProvider } from "@editor/contexts/CheckoutContext";
import { UpgradeBannerInitializer } from "@editor/components/shared/UpgradeBannerInitializer";
import { UpdateSeatsProvider } from "@editor/contexts/UpdateSeatsContext";
import { ChatProvider } from "@editor/components/chat/ChatContext";
import { AccountLinkNotice } from "@editor/components/AccountLinkNotice";

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <CoreAppProviders>
      <UpdateSeatsProvider>
        <CheckoutProvider>
          <UpgradeBannerInitializer />
          <AccountLinkNotice />
          <ChatProvider>{children}</ChatProvider>
        </CheckoutProvider>
      </UpdateSeatsProvider>
    </CoreAppProviders>
  );
}

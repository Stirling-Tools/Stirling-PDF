import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { type AppProvidersProps } from "@core/components/AppProviders";
import { ChatProvider } from "@app/components/chat/ChatContext";

export type { AppProvidersProps };

export function AppProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: AppProvidersProps) {
  return (
    <ProprietaryAppProviders
      appConfigRetryOptions={appConfigRetryOptions}
      appConfigProviderProps={appConfigProviderProps}
    >
      <ChatProvider>{children}</ChatProvider>
    </ProprietaryAppProviders>
  );
}

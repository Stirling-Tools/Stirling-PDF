import { ReactNode, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppQueryClient } from "@editor/query/queryClient";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import {
  AppConfigProvider,
  AppConfigProviderProps,
  AppConfigRetryOptions,
} from "@editor/contexts/AppConfigContext";

type AppConfigProviderOverrides = Omit<
  AppConfigProviderProps,
  "children" | "retryOptions"
>;

export interface PlatformProvidersProps {
  children: ReactNode;
  appConfigRetryOptions?: AppConfigRetryOptions;
  appConfigProviderProps?: Partial<AppConfigProviderOverrides>;
}

/**
 * Session-wide state every app reads. Mounted above the app frame, so it
 * survives switching between apps; each app's own providers sit inside it and
 * must not mount a second copy of anything here.
 */
export function PlatformProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: PlatformProvidersProps) {
  const [queryClient] = useState(createAppQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider
        retryOptions={appConfigRetryOptions}
        {...appConfigProviderProps}
      >
        <ToolRegistryProvider>{children}</ToolRegistryProvider>
      </AppConfigProvider>
    </QueryClientProvider>
  );
}

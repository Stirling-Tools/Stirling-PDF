import { ReactNode } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";
import { DesktopConfigSync } from '@app/components/DesktopConfigSync';
import { DESKTOP_DEFAULT_APP_CONFIG } from '@app/config/defaultAppConfig';
import { DefaultAppPrompt } from '@app/components/DefaultAppPrompt';
import { useDefaultAppPrompt } from '@app/hooks/useDefaultAppPrompt';

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 * - Shows default PDF handler prompt on first launch
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { promptOpened, handleSetDefault, handleDismiss } = useDefaultAppPrompt();

  return (
    <ProprietaryAppProviders
      appConfigRetryOptions={{
        maxRetries: 5,
        initialDelay: 1000, // 1 second, with exponential backoff
      }}
      appConfigProviderProps={{
        initialConfig: DESKTOP_DEFAULT_APP_CONFIG,
        bootstrapMode: 'non-blocking',
        autoFetch: false,
      }}
    >
      <DesktopConfigSync />
      <DefaultAppPrompt
        opened={promptOpened}
        onSetDefault={handleSetDefault}
        onDismiss={handleDismiss}
      />
      {children}
    </ProprietaryAppProviders>
  );
}

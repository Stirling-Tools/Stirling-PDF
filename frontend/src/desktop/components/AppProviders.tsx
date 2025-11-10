import { ReactNode } from "react";
import { AppProviders as ProprietaryAppProviders } from "@proprietary/components/AppProviders";

/**
 * Desktop application providers
 * Wraps proprietary providers and adds desktop-specific configuration
 * - Enables retry logic for app config (needed for Tauri mode when backend is starting)
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ProprietaryAppProviders
      appConfigRetryOptions={{
        maxRetries: 5,
        initialDelay: 1000, // 1 second, with exponential backoff
      }}
    >
      {children}
    </ProprietaryAppProviders>
  );
}

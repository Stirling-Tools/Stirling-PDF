/**
 * Proprietary wrapper that overrides the core IDB-only WatchFolderStorageProvider
 * with the server-backed implementation when premium is enabled.
 */

import React from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { WatchFolderStorageProvider } from '@app/contexts/WatchFolderStorageContext';
import { serverBackend } from '@proprietary/services/watchFolderServerBackend';

export function WatchFolderServerProvider({ children }: { children: React.ReactNode }) {
  const { config } = useAppConfig();
  const isPremium = config?.premiumEnabled === true;

  if (!isPremium) {
    // Core's IDB provider is already in place — just pass through
    return <>{children}</>;
  }

  // Override with server-backed storage
  return (
    <WatchFolderStorageProvider backend={serverBackend}>
      {children}
    </WatchFolderStorageProvider>
  );
}

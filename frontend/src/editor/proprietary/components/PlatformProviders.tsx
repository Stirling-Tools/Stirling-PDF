import {
  PlatformProviders as CorePlatformProviders,
  PlatformProvidersProps,
} from "@editor-core/components/PlatformProviders";
import { AuthProvider } from "@editor/auth/UseSession";
import { LicenseProvider } from "@editor/contexts/LicenseContext";
import { ServerExperienceProvider } from "@editor/contexts/ServerExperienceContext";

export type { PlatformProvidersProps };

export function PlatformProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: PlatformProvidersProps) {
  return (
    <AuthProvider>
      <CorePlatformProviders
        appConfigRetryOptions={appConfigRetryOptions}
        appConfigProviderProps={appConfigProviderProps}
      >
        <LicenseProvider>
          <ServerExperienceProvider>{children}</ServerExperienceProvider>
        </LicenseProvider>
      </CorePlatformProviders>
    </AuthProvider>
  );
}

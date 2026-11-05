import type { ReactNode } from "react";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";
import { AppMantineProvider } from "@editor/components/shared/AppMantineProvider";

/**
 * Theme and preferences only, for pages that render without a session: no
 * PlatformProviders, so no auth and no backend bootstrap.
 */
export function PublicRouteProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <AppMantineProvider>{children}</AppMantineProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}

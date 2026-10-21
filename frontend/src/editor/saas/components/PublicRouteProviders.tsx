import type { ReactNode } from "react";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";

/**
 * Theme and preferences only, for pages that render without a session: no
 * AppProviders, so no auth and no backend bootstrap.
 */
export function PublicRouteProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </PreferencesProvider>
  );
}

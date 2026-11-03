import type { ReactNode } from "react";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";

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

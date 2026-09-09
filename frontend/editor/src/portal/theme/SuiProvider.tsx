import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import {
  mantineTheme,
  suiCssVariablesResolver,
} from "@portal/theme/mantineTheme";

export interface SuiProviderProps {
  /**
   * Resolved colour scheme. Must match whatever drives [data-theme] so the
   * Mantine chrome and the SUI CSS tokens switch together.
   */
  colorScheme: "light" | "dark";
  children: ReactNode;
}

/**
 * Sets up the SUI design system for a subtree. Mantine is an implementation
 * detail of the SUI components (@app/ui); this provider applies the SUI-token
 * theme and remaps Mantine's neutral palette (dropdown/popover surfaces,
 * borders, text) onto SUI tokens so floating elements follow the SUI palette
 * in both colour schemes.
 */
export function SuiProvider({ colorScheme, children }: SuiProviderProps) {
  return (
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={suiCssVariablesResolver}
      forceColorScheme={colorScheme}
    >
      {children}
    </MantineProvider>
  );
}

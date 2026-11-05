import { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { useTheme } from "@editor/components/shared/ThemeProvider";
import {
  mantineTheme,
  appCssVariablesResolver,
} from "@editor/theme/mantineTheme";
import { ToastProvider } from "@editor/components/toast";
import ToastRenderer from "@editor/components/toast/ToastRenderer";
import { ToastPortalBinder } from "@editor/components/toast";

/** Mantine under the app theme, plus the toast layer. Expects ThemeProvider above it. */
export function AppMantineProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useTheme();
  return (
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={appCssVariablesResolver}
      defaultColorScheme={colorScheme}
      forceColorScheme={colorScheme}
    >
      <div style={{ minHeight: "100vh" }}>
        <ToastProvider>
          <ToastPortalBinder />
          {children}
          <ToastRenderer />
        </ToastProvider>
      </div>
    </MantineProvider>
  );
}

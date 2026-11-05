import { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { useTheme } from "@editor/components/shared/ThemeProvider";
import {
  mantineTheme,
  editorCssVariablesResolver,
} from "@editor/theme/mantineTheme";
import { ToastProvider } from "@editor/components/toast";
import ToastRenderer from "@editor/components/toast/ToastRenderer";
import { ToastPortalBinder } from "@editor/components/toast";

/** Mantine under the editor's theme, plus the toast layer. Expects ThemeProvider above it. */
export function EditorMantineProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useTheme();
  return (
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={editorCssVariablesResolver}
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

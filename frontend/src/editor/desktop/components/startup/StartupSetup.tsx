import type { ReactNode } from "react";
import { StartupSetup as CoreStartupSetup } from "@editor-core/components/startup/StartupSetup";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useSaaSMode } from "@editor/hooks/useSaaSMode";

/** DesktopConfigSync owns backend readiness; hosted accounts have no Spring setup. */
export function StartupSetup({ children }: { children: ReactNode }) {
  const isSaaSMode = useSaaSMode();
  const { config } = useAppConfig();
  if (isSaaSMode || !config?.appVersion) return <>{children}</>;
  return (
    <CoreStartupSetup refreshConfigOnMount={false}>{children}</CoreStartupSetup>
  );
}

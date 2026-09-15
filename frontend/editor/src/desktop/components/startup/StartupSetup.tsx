import type { ReactNode } from "react";
import { StartupSetup as CoreStartupSetup } from "@core/components/startup/StartupSetup";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

/** DesktopConfigSync owns backend readiness; hosted accounts have no Spring setup. */
export function StartupSetup({ children }: { children: ReactNode }) {
  const isSaaSMode = useSaaSMode();
  const { config } = useAppConfig();
  if (isSaaSMode || !config?.appVersion) return <>{children}</>;
  return (
    <CoreStartupSetup refreshConfigOnMount={false}>{children}</CoreStartupSetup>
  );
}

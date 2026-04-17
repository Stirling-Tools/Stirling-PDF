import { useState, useEffect, useMemo } from "react";
import { Box, Tooltip, rem, useComputedColorScheme } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";
import {
  selfHostedServerMonitor,
  type SelfHostedServerState,
} from "@app/services/selfHostedServerMonitor";
import { useBackendHealth } from "@app/hooks/useBackendHealth";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";

interface RightRailFooterExtensionsProps {
  className?: string;
}

function ConnectionStatusDot() {
  const { t } = useTranslation();
  const colorScheme = useComputedColorScheme("light");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(
    null,
  );
  const [selfHostedState, setSelfHostedState] = useState<SelfHostedServerState>(
    () => selfHostedServerMonitor.getSnapshot(),
  );
  const { isOnline, checkHealth } = useBackendHealth();

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    const unsubscribe = connectionModeService.subscribeToModeChanges(
      (config) => {
        setConnectionMode(config.mode);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    return selfHostedServerMonitor.subscribe(setSelfHostedState);
  }, []);

  const { label, color } = useMemo(() => {
    if (connectionMode === "saas") {
      return {
        label: t("connectionMode.status.saas", "Connected to Stirling Cloud"),
        color: "#3b82f6",
      };
    }
    if (connectionMode === "selfhosted") {
      const serverOnline = selfHostedState.isOnline;
      const serverChecking = selfHostedState.status === "checking";
      const backendLabel = serverChecking
        ? t(
            "connectionMode.status.selfhostedChecking",
            "Connected to self-hosted server (checking...)",
          )
        : serverOnline
          ? t(
              "connectionMode.status.selfhostedOnline",
              "Connected to self-hosted server",
            )
          : t(
              "connectionMode.status.selfhostedOffline",
              "Self-hosted server unreachable",
            );
      return {
        label: backendLabel,
        color: serverChecking
          ? "#fcc419"
          : serverOnline
            ? "#37b24d"
            : "#e03131",
      };
    }
    // local
    return {
      label: isOnline
        ? t("connectionMode.status.localOnline", "Offline mode running")
        : t("connectionMode.status.localOffline", "Offline mode running"),
      color: "#868e96",
    };
  }, [connectionMode, selfHostedState, isOnline, t]);

  return (
    <Tooltip
      label={label}
      position="left"
      offset={12}
      withArrow
      withinPortal
      color={colorScheme === "dark" ? undefined : "dark"}
    >
      <Box
        component="span"
        role="status"
        aria-label={label}
        tabIndex={0}
        onClick={() => {
          if (connectionMode === "local") {
            window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
          } else {
            void checkHealth();
          }
        }}
        style={{
          width: rem(10),
          height: rem(10),
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow:
            colorScheme === "dark"
              ? "0 0 0 2px rgba(255, 255, 255, 0.15)"
              : "0 0 0 2px rgba(0, 0, 0, 0.07)",
          display: "inline-block",
          cursor: "pointer",
          outline: "none",
        }}
      />
    </Tooltip>
  );
}

export function RightRailFooterExtensions({
  className,
}: RightRailFooterExtensionsProps) {
  return (
    <Box
      className={className}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: rem(12),
      }}
    >
      <ConnectionStatusDot />
    </Box>
  );
}

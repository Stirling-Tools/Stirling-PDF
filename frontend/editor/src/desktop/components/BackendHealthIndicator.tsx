import React, { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Box, Tooltip, useMantineTheme, rem } from "@mantine/core";
import { useBackendHealth } from "@app/hooks/useBackendHealth";

interface BackendHealthIndicatorProps {
  className?: string;
}

export const BackendHealthIndicator: React.FC<BackendHealthIndicatorProps> = ({
  className = "",
}) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { status, isOnline, checkHealth } = useBackendHealth();

  const label = useMemo(() => {
    if (status === "starting") {
      return t("backendHealth.checking", "Checking backend status...");
    }

    if (isOnline) {
      return t("backendHealth.online", "Backend Online");
    }

    return t("backendHealth.offline", "Backend Offline");
  }, [status, isOnline, t]);

  const dotColor = useMemo(() => {
    if (status === "starting") {
      return theme.colors.yellow?.[5] ?? "#fcc419";
    }
    if (isOnline) {
      return theme.colors.green?.[5] ?? "#37b24d";
    }
    return theme.colors.red?.[6] ?? "#e03131";
  }, [
    status,
    isOnline,
    theme.colors.green,
    theme.colors.red,
    theme.colors.yellow,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        checkHealth();
      }
    },
    [checkHealth],
  );

  return (
    <Tooltip label={label} position="left" offset={12} withArrow withinPortal>
      <Box
        component="span"
        className={className ? `${className}` : undefined}
        role="status"
        aria-live="polite"
        aria-label={label}
        tabIndex={0}
        onClick={checkHealth}
        onKeyDown={handleKeyDown}
        style={{
          width: rem(12),
          height: rem(12),
          borderRadius: "50%",
          backgroundColor: dotColor,
          boxShadow: "var(--status-dot-ring)",
          cursor: "pointer",
          display: "inline-block",
          outline: "none",
        }}
      />
    </Tooltip>
  );
};

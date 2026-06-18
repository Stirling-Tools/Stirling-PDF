import React, { ReactNode } from "react";
import { Paper, Group, Text, Button, ActionIcon, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";

type InfoBannerTone = "info" | "warning";

const toneStyles: Record<
  InfoBannerTone,
  {
    background: string;
    border: string;
    text: string;
    icon: string;
    buttonColor: string;
  }
> = {
  info: {
    background: "var(--mantine-color-blue-0)",
    border: "var(--mantine-color-blue-2)",
    text: "var(--mantine-color-blue-9)",
    icon: "var(--mantine-color-blue-6)",
    buttonColor: "blue",
  },
  warning: {
    background: "var(--mantine-color-orange-0)",
    border: "var(--mantine-color-orange-3)",
    text: "var(--mantine-color-orange-9)",
    icon: "var(--mantine-color-orange-7)",
    buttonColor: "orange",
  },
};

interface InfoBannerProps {
  /**
   * Either a LocalIcon name (string) for the standard sized icon slot, or a
   * pre-rendered ReactNode (e.g. a logo image) which is dropped in as-is.
   */
  icon?: string | ReactNode;
  title?: ReactNode;
  message: ReactNode;
  buttonText?: string;
  buttonIcon?: string;
  onButtonClick?: () => void;
  onDismiss?: () => void;
  dismissible?: boolean;
  loading?: boolean;
  show?: boolean;
  tone?: InfoBannerTone;
  background?: string;
  borderColor?: string;
  textColor?: string;
  iconColor?: string;
  buttonColor?: string;
  buttonVariant?: "light" | "filled" | "white" | "outline" | "subtle";
  /** Override the button label colour (for dark/custom theme variants). */
  buttonTextColor?: string;
  minHeight?: number | string;
  closeIconColor?: string;
  compact?: boolean;
}

/**
 * Generic info banner component for displaying dismissible messages at the top of the app
 */
export const InfoBanner: React.FC<InfoBannerProps> = ({
  icon,
  title,
  message,
  buttonText,
  buttonIcon = "check-circle-rounded",
  onButtonClick,
  onDismiss,
  dismissible = true,
  loading = false,
  show = true,
  tone = "info",
  background,
  borderColor,
  textColor,
  iconColor,
  buttonColor,
  buttonVariant = "light",
  buttonTextColor,
  minHeight = 56,
  closeIconColor,
  compact = false,
}) => {
  const { t } = useTranslation();
  if (!show) {
    return null;
  }

  const toneStyle = toneStyles[tone] ?? toneStyles.info;
  const handleDismiss = () => {
    onDismiss?.();
  };

  const iconSize = compact ? "1rem" : "1.2rem";
  const textSize = compact ? "xs" : "sm";
  const buttonSize = compact ? "xs" : "xs";

  return (
    <Paper
      p={compact ? "xs" : "sm"}
      radius={0}
      style={{
        background: background ?? toneStyle.background,
        border: "none",
        borderBottom:
          borderColor === "transparent"
            ? "none"
            : `1px solid ${borderColor ?? toneStyle.border}`,
        minHeight,
        display: "flex",
        alignItems: "center",
      }}
    >
      <Group
        gap="sm"
        align="center"
        wrap="nowrap"
        justify="space-between"
        style={{ width: "100%" }}
      >
        <Group
          gap={compact ? "xs" : "sm"}
          align="center"
          wrap="nowrap"
          style={{ flex: 1, minWidth: 0 }}
        >
          {icon != null &&
            (typeof icon === "string" ? (
              <LocalIcon
                icon={icon}
                width={iconSize}
                height={iconSize}
                style={{ color: iconColor ?? toneStyle.icon, flexShrink: 0 }}
              />
            ) : (
              <div
                style={{ flexShrink: 0, display: "flex", alignItems: "center" }}
              >
                {icon}
              </div>
            ))}
          <Stack gap={compact ? 1 : 2} style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Text
                fw={600}
                size={textSize}
                style={{ color: textColor ?? toneStyle.text }}
              >
                {title}
              </Text>
            )}
            <Text
              fw={title ? 400 : 500}
              size={textSize}
              style={{ color: textColor ?? toneStyle.text }}
              lineClamp={compact ? 1 : 2}
            >
              {message}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs" align="center" wrap="nowrap">
          {buttonText && onButtonClick && (
            <Button
              variant={buttonVariant}
              color={buttonColor ?? toneStyle.buttonColor}
              size={buttonSize}
              onClick={onButtonClick}
              loading={loading}
              leftSection={
                <LocalIcon
                  icon={buttonIcon}
                  width={compact ? "0.75rem" : "0.9rem"}
                  height={compact ? "0.75rem" : "0.9rem"}
                />
              }
              styles={
                buttonTextColor
                  ? { label: { color: buttonTextColor } }
                  : undefined
              }
            >
              {buttonText}
            </Button>
          )}
          {dismissible && (
            <ActionIcon
              variant="subtle"
              color={closeIconColor ? undefined : "gray"}
              size="sm"
              onClick={handleDismiss}
              aria-label={t("infoBanner.dismiss", "Dismiss")}
              style={closeIconColor ? { color: closeIconColor } : undefined}
            >
              <LocalIcon
                icon="close-rounded"
                width={compact ? "0.85rem" : "1rem"}
                height={compact ? "0.85rem" : "1rem"}
              />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Paper>
  );
};

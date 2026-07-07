import {
  Center,
  Loader,
  Overlay,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";

interface PolicyEnforcingOverlayProps {
  enforcing: boolean;
  /** 0-100 progress when the run reports step counts; omit for indeterminate. */
  progress?: number;
  zIndex?: number;
  /** When provided, an × button is shown and called on click. */
  onDismiss?: () => void;
}

/**
 * Frosted-glass enforcement overlay. Renders into its nearest positioned ancestor
 * (position: relative) — works for both the full-screen viewer and thumbnail cards.
 */
export function PolicyEnforcingOverlay({
  enforcing,
  progress,
  zIndex = 200,
  onDismiss,
}: PolicyEnforcingOverlayProps) {
  const { t } = useTranslation();
  if (!enforcing) return null;
  return (
    <Overlay
      color="var(--color-bg)"
      backgroundOpacity={0.9}
      blur={4}
      zIndex={zIndex}
    >
      {onDismiss && (
        <Tooltip
          label={t("policy.viewAnyway", "View file (policy still enforcing)")}
          position="left"
          withArrow
        >
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={onDismiss}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: zIndex + 1,
            }}
            aria-label={t("policy.dismiss", "Dismiss overlay")}
          >
            <CloseIcon style={{ fontSize: 16 }} />
          </ActionIcon>
        </Tooltip>
      )}
      <Center style={{ height: "100%" }}>
        <Stack align="center" gap="md" w={220}>
          <ThemeIcon size={48} radius="xl" variant="light" color="blue">
            <ShieldOutlinedIcon style={{ fontSize: 26 }} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            {t("policy.enforcingTitle", "Enforcing policy…")}
          </Text>
          {progress != null ? (
            <Progress
              w="100%"
              size="xs"
              radius="xl"
              value={progress}
              striped
              animated
            />
          ) : (
            <Loader size="xs" />
          )}
        </Stack>
      </Center>
    </Overlay>
  );
}

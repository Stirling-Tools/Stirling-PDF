import { useState } from "react";
import { Anchor, Code, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useAppConfig } from "@app/contexts/AppConfigContext";

const BANNER_DISMISSED_KEY = "stirlingpdf_features_banner_dismissed";

/**
 * Shown only when login is off: the two env vars that turn on accounts, teams
 * and the admin surface. Dismissed for good once closed.
 */
export function AdminSetupBanner() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    // Check localStorage on mount
    return localStorage.getItem(BANNER_DISMISSED_KEY) === "true";
  });

  // Check if login is disabled
  const loginDisabled = !config?.enableLogin;

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
  };

  if (!loginDisabled || bannerDismissed) {
    return null;
  }

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{
        background: "var(--mantine-color-blue-0)",
        position: "relative",
      }}
    >
      <ActionIcon
        variant="tertiary"
        size="sm"
        style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
        onClick={handleDismissBanner}
        aria-label={t("settings.general.enableFeatures.dismiss", "Dismiss")}
      >
        <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
      </ActionIcon>
      <Stack gap="sm">
        <Group gap="xs">
          <LocalIcon
            icon="admin-panel-settings-rounded"
            width="1.2rem"
            height="1.2rem"
            style={{ color: "var(--c-accent-text)" }}
          />
          <Text
            fw={600}
            size="sm"
            style={{ color: "var(--mantine-color-blue-9)" }}
          >
            {t(
              "settings.general.enableFeatures.title",
              "For System Administrators",
            )}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {t(
            "settings.general.enableFeatures.intro",
            "Enable user authentication, team management, and workspace features for your organization.",
          )}
        </Text>
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed">
            {t("settings.general.enableFeatures.action", "Configure")}
          </Text>
          <Code>SECURITY_ENABLELOGIN=true</Code>
          <Text size="sm" c="dimmed">
            {t("settings.general.enableFeatures.and", "and")}
          </Text>
          <Code>DISABLE_ADDITIONAL_FEATURES=false</Code>
        </Group>
        <Text size="xs" c="dimmed" fs="italic">
          {t(
            "settings.general.enableFeatures.benefit",
            "Enables user roles, team collaboration, admin controls, and enterprise features.",
          )}
        </Text>
        <Anchor
          href="https://docs.stirlingpdf.com/Configuration/System%20and%20Security/"
          target="_blank"
          size="sm"
        >
          {t(
            "settings.general.enableFeatures.learnMore",
            "Learn more in documentation",
          )}{" "}
          →
        </Anchor>
      </Stack>
    </Paper>
  );
}

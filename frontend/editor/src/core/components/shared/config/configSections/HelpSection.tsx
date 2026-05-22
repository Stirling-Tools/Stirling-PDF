import React from "react";
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { requestStartTour } from "@app/constants/events";

interface HelpSectionProps {
  isAdmin: boolean;
  onRequestClose: () => void;
}

const HelpSection: React.FC<HelpSectionProps> = ({
  isAdmin,
  onRequestClose,
}) => {
  const { t } = useTranslation();

  const startTour = (tourType: "tools" | "admin") => {
    onRequestClose();
    setTimeout(() => requestStartTour(tourType), 300);
  };

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600} size="sm">
                {t("settings.help.toolsTour.title", "Tools Tour")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.help.toolsTour.description",
                  "Walk through uploading files, picking a tool, and reviewing results.",
                )}
              </Text>
            </div>
            <Button
              variant="default"
              size="sm"
              leftSection={
                <LocalIcon
                  icon="build-outline-rounded"
                  width="1rem"
                  height="1rem"
                />
              }
              onClick={() => startTour("tools")}
            >
              {t("settings.help.toolsTour.start", "Start")}
            </Button>
          </Group>

          {isAdmin && (
            <Group justify="space-between" align="center">
              <div>
                <Text fw={600} size="sm">
                  {t("settings.help.adminTour.title", "Admin Tour")}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "settings.help.adminTour.description",
                    "Explore team management, system settings, and enterprise features.",
                  )}
                </Text>
              </div>
              <Button
                variant="default"
                size="sm"
                leftSection={
                  <LocalIcon icon="person-rounded" width="1rem" height="1rem" />
                }
                onClick={() => startTour("admin")}
              >
                {t("settings.help.adminTour.start", "Start")}
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};

export default HelpSection;

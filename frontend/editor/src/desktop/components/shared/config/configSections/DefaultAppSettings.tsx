import React from "react";
import { Paper, Text, Group, Switch, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { useDefaultApp } from "@app/hooks/useDefaultApp";

export const DefaultAppSettings: React.FC = () => {
  const { t } = useTranslation();
  const {
    isDefault,
    isLoading,
    promptDismissed,
    handleSetDefault,
    setRemindWhenNotDefault,
  } = useDefaultApp();

  // Remind is on by default (promptDismissed is false until the user opts out).
  const remindEnabled = !promptDismissed;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <div>
            <Text fw={500} size="sm">
              {t("settings.general.defaultPdfEditor", "Default PDF editor")}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {isDefault === true
                ? t(
                    "settings.general.defaultPdfEditorActive",
                    "Stirling PDF is your default PDF editor",
                  )
                : isDefault === false
                  ? t(
                      "settings.general.defaultPdfEditorInactive",
                      "Another application is set as default",
                    )
                  : t(
                      "settings.general.defaultPdfEditorChecking",
                      "Checking...",
                    )}
            </Text>
          </div>
          <Button
            variant={isDefault ? "secondary" : "primary"}
            size="sm"
            onClick={handleSetDefault}
            loading={isLoading}
            disabled={isDefault === true}
          >
            {isDefault
              ? t("settings.general.defaultPdfEditorSet", "Already Default")
              : t("settings.general.setAsDefault", "Set as Default")}
          </Button>
        </Group>

        {isDefault === false && (
          <Group justify="space-between" align="center" wrap="nowrap">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="sm">
                {t(
                  "settings.general.defaultPdfEditorRemind",
                  "Remind me to set as default",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.defaultPdfEditorRemindDescription",
                  "Show a banner when Stirling PDF is not your default PDF application.",
                )}
              </Text>
            </div>
            <Switch
              checked={remindEnabled}
              onChange={(event) =>
                setRemindWhenNotDefault(event.currentTarget.checked)
              }
              aria-label={t(
                "settings.general.defaultPdfEditorRemind",
                "Remind me to set as default",
              )}
            />
          </Group>
        )}
      </Stack>
    </Paper>
  );
};

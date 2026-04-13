import React from "react";
import { Paper, Text, Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDefaultApp } from "@app/hooks/useDefaultApp";

export const DefaultAppSettings: React.FC = () => {
  const { t } = useTranslation();
  const { isDefault, isLoading, isPromptSuppressed, handleSetDefault, resetPromptPreferences } = useDefaultApp();

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={500} size="sm">
            {t("settings.general.defaultPdfEditor", "Default PDF editor")}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {isDefault === true
              ? t("settings.general.defaultPdfEditorActive", "Stirling PDF is your default PDF editor")
              : isDefault === false
                ? t("settings.general.defaultPdfEditorInactive", "Another application is set as default")
                : t("settings.general.defaultPdfEditorChecking", "Checking...")}
          </Text>
        </div>
        <Button
          variant={isDefault ? "light" : "filled"}
          color="blue"
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
      {isPromptSuppressed && isDefault === false && (
        <Group justify="space-between" align="center" mt="sm">
          <Text size="xs" c="dimmed">
            {t(
              "settings.general.defaultPdfEditorPromptSuppressed",
              "The startup reminder is currently disabled on this device.",
            )}
          </Text>
          <Button variant="subtle" size="xs" onClick={resetPromptPreferences}>
            {t("settings.general.defaultPdfEditorPromptRestore", "Enable reminder again")}
          </Button>
        </Group>
      )}
    </Paper>
  );
};

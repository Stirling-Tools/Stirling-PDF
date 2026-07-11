import { useState } from "react";
import { Alert, Group, Paper, Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import apiClient from "@app/services/apiClient";

export default function PrivacySection() {
  const { t } = useTranslation();
  const { config, refetch } = useAppConfig();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (enabled: boolean) => {
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("enabled", enabled.toString());
      await apiClient.post(
        "/api/v1/settings/desktop/update-enable-analytics",
        formData,
      );
      await refetch();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t(
              "settings.privacy.analytics.error",
              "Could not update the analytics preference.",
            ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg">
      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <div>
            <Text fw={600} size="sm">
              {t("settings.privacy.analytics.label", "Usage analytics")}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "settings.privacy.analytics.description",
                "Share anonymous usage data to help improve Stirling PDF. File contents and personal information are never collected.",
              )}
            </Text>
          </div>
          <Switch
            checked={config?.enableAnalytics === true}
            disabled={saving}
            onChange={(event) => void handleChange(event.currentTarget.checked)}
            aria-label={t(
              "settings.privacy.analytics.label",
              "Usage analytics",
            )}
          />
        </Group>
      </Paper>
    </Stack>
  );
}

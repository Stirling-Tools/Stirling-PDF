import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NumberInput, Stack, Paper, Text, Loader, Group } from "@mantine/core";
import { alert } from "@app/components/toast";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import {
  AiEngineSettingsData,
  AiEngineLimits,
  AiEngineApiResponse,
  clampMin,
  savedToastBody,
} from "@app/components/shared/config/configSections/aiEngineSettings";

export default function AdminAiLimitsSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();

  const {
    settings,
    setSettings,
    loading,
    saving,
    fetchSettings,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<AiEngineSettingsData>({
    sectionName: "aiEngine",
    fetchTransformer: async (): Promise<
      AiEngineSettingsData & { _pending?: Partial<AiEngineSettingsData> }
    > => {
      const response = await apiClient.get<AiEngineApiResponse>(
        "/api/v1/admin/settings/section/aiEngine",
      );
      return response.data || {};
    },
    // Save ONLY this page's keys as dot-notation so sibling AI keys are preserved.
    saveTransformer: (s: AiEngineSettingsData) => ({
      sectionData: {},
      deltaSettings: {
        // All must be >= 1; a 0 page/char cap or 0 concurrency breaks or deadlocks the engine.
        "aiEngine.limits.maxPages": clampMin(s.limits?.maxPages, 1),
        "aiEngine.limits.maxCharacters": clampMin(s.limits?.maxCharacters, 1),
        "aiEngine.limits.modelMaxConcurrency": clampMin(
          s.limits?.modelMaxConcurrency,
          1,
        ),
      },
    }),
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const handleSave = async () => {
    try {
      await saveSettings();
      markSaved();
      // Engine-facing values are pushed to the AI engine live on save; no restart needed.
      alert({
        alertType: "success",
        title: t("admin.settings.ai.saved.title", "AI settings saved"),
        body: savedToastBody(settings, t),
      });
    } catch (_error) {
      alert({
        alertType: "error",
        title: t("admin.error", "Error"),
        body: t("admin.settings.saveError", "Failed to save settings"),
      });
    }
  };

  const handleDiscard = useCallback(() => {
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  const setLimits = (patch: Partial<AiEngineLimits>) =>
    setSettings({
      ...settings,
      limits: { ...(settings.limits || {}), ...patch },
    });

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.ai.limits.title", "Limits & Performance")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.ai.limits.description",
              "Guardrails for how much work AI requests may do and how many run concurrently. Applied to the AI engine when saved.",
            )}
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.limits.maxPages.label",
                      "Max pages per request",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("limits.maxPages")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.limits.maxPages.description",
                "Guardrail: reject AI requests over this many PDF pages.",
              )}
              value={settings.limits?.maxPages ?? 0}
              onChange={(value) => setLimits({ maxPages: Number(value) })}
              min={1}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.limits.maxCharacters.label",
                      "Max characters per request",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("limits.maxCharacters")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.limits.maxCharacters.description",
                "Guardrail: reject AI requests whose extracted text exceeds this length.",
              )}
              value={settings.limits?.maxCharacters ?? 0}
              onChange={(value) => setLimits({ maxCharacters: Number(value) })}
              min={1}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.limits.modelMaxConcurrency.label",
                      "Model max concurrency",
                    )}
                  </span>
                  <PendingBadge
                    show={isFieldPending("limits.modelMaxConcurrency")}
                  />
                </Group>
              }
              description={t(
                "admin.settings.ai.limits.modelMaxConcurrency.description",
                "Maximum simultaneous in-flight model calls across the whole engine.",
              )}
              value={settings.limits?.modelMaxConcurrency ?? 0}
              onChange={(value) =>
                setLimits({ modelMaxConcurrency: Number(value) })
              }
              min={1}
            />
          </Stack>
        </Paper>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}

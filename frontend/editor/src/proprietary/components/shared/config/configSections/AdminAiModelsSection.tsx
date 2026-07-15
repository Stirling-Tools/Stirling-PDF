import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  NumberInput,
  PasswordInput,
  Autocomplete,
  Select,
  Stack,
  Paper,
  Text,
  Loader,
  Group,
  Alert,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import {
  AiEngineSettingsData,
  AiEngineModels,
  AiEngineApiResponse,
  MODEL_SUGGESTIONS,
} from "@app/components/shared/config/configSections/aiEngineSettings";

export default function AdminAiModelsSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();

  // Track whether the user actually edited the masked secret. If not, we omit
  // it from the delta entirely so we never send "********" back to the server.
  const [apiKeyDirty, setApiKeyDirty] = useState(false);

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
    saveTransformer: (s: AiEngineSettingsData) => {
      const deltaSettings: Record<string, unknown> = {
        "aiEngine.models.provider": s.models?.provider ?? "anthropic",
        "aiEngine.models.smartModel": s.models?.smartModel ?? "",
        "aiEngine.models.fastModel": s.models?.fastModel ?? "",
        "aiEngine.models.smartMaxTokens": s.models?.smartMaxTokens ?? 0,
        "aiEngine.models.fastMaxTokens": s.models?.fastMaxTokens ?? 0,
        "aiEngine.models.baseUrl": s.models?.baseUrl ?? "",
      };
      // Only include the secret when the user typed a new value.
      if (apiKeyDirty) {
        deltaSettings["aiEngine.models.apiKey"] = s.models?.apiKey ?? "";
      }
      return { sectionData: {}, deltaSettings };
    },
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
      setApiKeyDirty(false);
      markSaved();
      // Engine-facing values are pushed to the AI engine live on save; no restart needed.
      alert({
        alertType: "success",
        title: t("admin.settings.ai.saved.title", "AI settings saved"),
        body: t(
          "admin.settings.ai.saved.body",
          "Changes are pushed to the AI engine automatically.",
        ),
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
    setApiKeyDirty(false);
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  const setModels = (patch: Partial<AiEngineModels>) =>
    setSettings({
      ...settings,
      models: { ...(settings.models || {}), ...patch },
    });

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const provider = settings.models?.provider || "anthropic";
  const showApiKey = provider !== "ollama";
  const showBaseUrl = provider === "ollama" || provider === "custom";
  const modelSuggestions = MODEL_SUGGESTIONS[provider] || [];

  const apiKeyLabel =
    provider === "anthropic"
      ? t("admin.settings.ai.models.apiKey.anthropic", "Anthropic API key")
      : provider === "openai"
        ? t("admin.settings.ai.models.apiKey.openai", "OpenAI API key")
        : t("admin.settings.ai.models.apiKey.generic", "API key");
  const apiKeyPlaceholder =
    provider === "anthropic"
      ? "sk-ant-..."
      : provider === "openai"
        ? "sk-..."
        : "";

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.ai.models.title", "Models & Providers")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.ai.models.description",
              "Choose the LLM provider and the smart/fast models the AI engine uses. Applied to the AI engine when saved.",
            )}
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Select
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.ai.models.provider.label", "Provider")}
                  </span>
                  <PendingBadge show={isFieldPending("models.provider")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.models.provider.description",
                "Which LLM provider the engine talks to.",
              )}
              data={[
                { value: "anthropic", label: "Anthropic" },
                { value: "openai", label: "OpenAI" },
                { value: "ollama", label: "Ollama" },
                { value: "custom", label: "Custom (OpenAI-compatible)" },
              ]}
              value={provider}
              onChange={(v) => setModels({ provider: v || "anthropic" })}
              allowDeselect={false}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />

            <Autocomplete
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.models.smartModel.label",
                      "Smart model",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("models.smartModel")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.models.smartModel.description",
                "High-capability model for complex reasoning. Free text; suggestions are hints only.",
              )}
              data={modelSuggestions}
              value={settings.models?.smartModel || ""}
              onChange={(value) => setModels({ smartModel: value })}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />

            <Autocomplete
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.models.fastModel.label",
                      "Fast model",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("models.fastModel")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.models.fastModel.description",
                "Cheaper, faster model for lightweight tasks. Free text; suggestions are hints only.",
              )}
              data={modelSuggestions}
              value={settings.models?.fastModel || ""}
              onChange={(value) => setModels({ fastModel: value })}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.models.smartMaxTokens.label",
                      "Smart model max tokens",
                    )}
                  </span>
                  <PendingBadge
                    show={isFieldPending("models.smartMaxTokens")}
                  />
                </Group>
              }
              description={t(
                "admin.settings.ai.models.smartMaxTokens.description",
                "Maximum output tokens for the smart model.",
              )}
              value={settings.models?.smartMaxTokens ?? 0}
              onChange={(value) => setModels({ smartMaxTokens: Number(value) })}
              min={1}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.models.fastMaxTokens.label",
                      "Fast model max tokens",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("models.fastMaxTokens")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.models.fastMaxTokens.description",
                "Maximum output tokens for the fast model.",
              )}
              value={settings.models?.fastMaxTokens ?? 0}
              onChange={(value) => setModels({ fastMaxTokens: Number(value) })}
              min={1}
            />

            {showApiKey && (
              <PasswordInput
                label={
                  <Group gap="xs">
                    <span>{apiKeyLabel}</span>
                    <PendingBadge show={isFieldPending("models.apiKey")} />
                  </Group>
                }
                description={t(
                  "admin.settings.ai.models.apiKey.description",
                  "Leave blank to use the engine's own environment credential. Applies to self-hosted single-engine deployments.",
                )}
                value={settings.models?.apiKey || ""}
                onChange={(e) => {
                  setApiKeyDirty(true);
                  setModels({ apiKey: e.target.value });
                }}
                placeholder={apiKeyPlaceholder}
              />
            )}

            {showBaseUrl && (
              <TextInput
                label={
                  <Group gap="xs">
                    <span>
                      {t(
                        "admin.settings.ai.models.baseUrl.label",
                        "Provider base URL",
                      )}
                    </span>
                    <PendingBadge show={isFieldPending("models.baseUrl")} />
                  </Group>
                }
                description={t(
                  "admin.settings.ai.models.baseUrl.description",
                  "Base URL of the OpenAI-compatible / Ollama endpoint, e.g. http://ollama:11434/v1.",
                )}
                value={settings.models?.baseUrl || ""}
                onChange={(e) => setModels({ baseUrl: e.target.value })}
                placeholder="http://ollama:11434/v1"
              />
            )}

            {showBaseUrl && (
              <Alert
                variant="light"
                color="orange"
                icon={
                  <LocalIcon
                    icon="warning-rounded"
                    width="1rem"
                    height="1rem"
                  />
                }
              >
                <Text size="xs">
                  {t(
                    "admin.settings.ai.models.baseUrl.warning",
                    "The base URL must point at a trusted internal endpoint. The engine will make server-side requests to it, so an untrusted value is SSRF-sensitive.",
                  )}
                </Text>
              </Alert>
            )}
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

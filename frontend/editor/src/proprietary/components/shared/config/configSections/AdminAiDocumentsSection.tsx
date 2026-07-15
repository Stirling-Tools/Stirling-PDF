import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NumberInput,
  PasswordInput,
  Autocomplete,
  Select,
  TextInput,
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
  AiEngineRag,
  AiEngineApiResponse,
  EMBEDDING_MODEL_SUGGESTIONS,
} from "@app/components/shared/config/configSections/aiEngineSettings";

export default function AdminAiDocumentsSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();

  // Track edits to the masked secret so we never send "********" back.
  const [embeddingApiKeyDirty, setEmbeddingApiKeyDirty] = useState(false);

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
        "aiEngine.rag.embeddingProvider":
          s.rag?.embeddingProvider ?? "voyageai",
        "aiEngine.rag.embeddingModel": s.rag?.embeddingModel ?? "",
        "aiEngine.rag.embeddingBaseUrl": s.rag?.embeddingBaseUrl ?? "",
        "aiEngine.rag.topK": s.rag?.topK ?? 0,
        "aiEngine.rag.maxSearches": s.rag?.maxSearches ?? 0,
      };
      if (embeddingApiKeyDirty) {
        deltaSettings["aiEngine.rag.embeddingApiKey"] =
          s.rag?.embeddingApiKey ?? "";
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
      setEmbeddingApiKeyDirty(false);
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
    setEmbeddingApiKeyDirty(false);
    setSettings(resetToSnapshot());
  }, [resetToSnapshot, setSettings]);

  const setRag = (patch: Partial<AiEngineRag>) =>
    setSettings({ ...settings, rag: { ...(settings.rag || {}), ...patch } });

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const embeddingProvider = settings.rag?.embeddingProvider || "voyageai";
  const embeddingSuggestions =
    EMBEDDING_MODEL_SUGGESTIONS[embeddingProvider] || [];
  const showEmbeddingBaseUrl =
    embeddingProvider === "ollama" || embeddingProvider === "custom";
  // Ollama's embeddings endpoint needs no API key, mirroring the Models page.
  const showEmbeddingApiKey = embeddingProvider !== "ollama";
  const embeddingApiKeyLabel =
    embeddingProvider === "voyageai"
      ? t(
          "admin.settings.ai.documents.embeddingApiKey.voyageai",
          "VoyageAI API key",
        )
      : embeddingProvider === "openai"
        ? t(
            "admin.settings.ai.documents.embeddingApiKey.openai",
            "OpenAI API key",
          )
        : t(
            "admin.settings.ai.documents.embeddingApiKey.generic",
            "Embedding API key",
          );
  const embeddingApiKeyPlaceholder =
    embeddingProvider === "voyageai"
      ? "pa-..."
      : embeddingProvider === "openai"
        ? "sk-..."
        : "";

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.ai.documents.title", "Documents & RAG")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.ai.documents.description",
              "Configure the embedding model and retrieval settings used to answer questions over documents. Applied to the AI engine when saved.",
            )}
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Select
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.documents.embeddingProvider.label",
                      "Embedding provider",
                    )}
                  </span>
                  <PendingBadge
                    show={isFieldPending("rag.embeddingProvider")}
                  />
                </Group>
              }
              description={t(
                "admin.settings.ai.documents.embeddingProvider.description",
                "Provider used to turn document text into vector embeddings.",
              )}
              data={[
                { value: "voyageai", label: "VoyageAI" },
                { value: "openai", label: "OpenAI" },
                { value: "ollama", label: "Ollama" },
                { value: "custom", label: "Custom (OpenAI-compatible)" },
              ]}
              value={embeddingProvider}
              onChange={(v) => setRag({ embeddingProvider: v || "voyageai" })}
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
                      "admin.settings.ai.documents.embeddingModel.label",
                      "Embedding model",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("rag.embeddingModel")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.documents.embeddingModel.description",
                "Embedding model name. Free text; suggestions are hints only.",
              )}
              data={embeddingSuggestions}
              value={settings.rag?.embeddingModel || ""}
              onChange={(value) => setRag({ embeddingModel: value })}
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />

            {showEmbeddingApiKey && (
              <PasswordInput
                label={
                  <Group gap="xs">
                    <span>{embeddingApiKeyLabel}</span>
                    <PendingBadge
                      show={isFieldPending("rag.embeddingApiKey")}
                    />
                  </Group>
                }
                description={t(
                  "admin.settings.ai.documents.embeddingApiKey.description",
                  "Leave blank to use the engine's own environment credential. Applies to self-hosted single-engine deployments.",
                )}
                value={settings.rag?.embeddingApiKey || ""}
                onChange={(e) => {
                  setEmbeddingApiKeyDirty(true);
                  setRag({ embeddingApiKey: e.target.value });
                }}
                placeholder={embeddingApiKeyPlaceholder}
              />
            )}

            {showEmbeddingBaseUrl && (
              <TextInput
                label={
                  <Group gap="xs">
                    <span>
                      {t(
                        "admin.settings.ai.documents.embeddingBaseUrl.label",
                        "Embedding base URL",
                      )}
                    </span>
                    <PendingBadge
                      show={isFieldPending("rag.embeddingBaseUrl")}
                    />
                  </Group>
                }
                description={t(
                  "admin.settings.ai.documents.embeddingBaseUrl.description",
                  "Base URL of the OpenAI-compatible / Ollama embeddings endpoint, e.g. http://ollama:11434/v1. Must point at a trusted internal endpoint (SSRF-sensitive).",
                )}
                value={settings.rag?.embeddingBaseUrl || ""}
                onChange={(e) => setRag({ embeddingBaseUrl: e.target.value })}
                placeholder="http://ollama:11434/v1"
              />
            )}

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.ai.documents.topK.label", "Top K")}
                  </span>
                  <PendingBadge show={isFieldPending("rag.topK")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.documents.topK.description",
                "Number of most-relevant chunks retrieved per search.",
              )}
              value={settings.rag?.topK ?? 0}
              onChange={(value) => setRag({ topK: Number(value) })}
              min={1}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.documents.maxSearches.label",
                      "Max searches",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("rag.maxSearches")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.documents.maxSearches.description",
                "Maximum number of retrieval searches the agent may run per request.",
              )}
              value={settings.rag?.maxSearches ?? 0}
              onChange={(value) => setRag({ maxSearches: Number(value) })}
              min={0}
            />
          </Stack>
        </Paper>

        <Alert
          variant="light"
          color="orange"
          title={t(
            "admin.settings.ai.documents.reindexNote.title",
            "Re-index required",
          )}
          icon={<LocalIcon icon="warning-rounded" width="1rem" height="1rem" />}
        >
          <Text size="xs">
            {t(
              "admin.settings.ai.documents.reindexNote.body",
              "Changing the embedding model invalidates previously-embedded documents. A full engine restart and re-index of existing documents is required for search to work correctly.",
            )}
          </Text>
        </Alert>
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

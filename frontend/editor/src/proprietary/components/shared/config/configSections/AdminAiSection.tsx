import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Loader } from "@mantine/core";
import { alert } from "@app/components/toast";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import {
  AiEngineSettingsData,
  AiEngineApiResponse,
  clampMin,
  savedToastBody,
} from "@app/components/shared/config/configSections/aiEngineSettings";
import { AiConnectionCard } from "@app/components/shared/config/configSections/ai/AiConnectionCard";
import { AiCapabilitiesCard } from "@app/components/shared/config/configSections/ai/AiCapabilitiesCard";
import { AiModelsCard } from "@app/components/shared/config/configSections/ai/AiModelsCard";
import { AiDocumentsCard } from "@app/components/shared/config/configSections/ai/AiDocumentsCard";
import { AiLimitsCard } from "@app/components/shared/config/configSections/ai/AiLimitsCard";
import "@app/components/shared/config/configSections/ai/AdminAiSection.css";

/** Keys the backend applies only on restart; everything else is pushed live. */
const RESTART_KEYS = [
  "enabled",
  "url",
  "timeoutSeconds",
  "longRunningTimeoutSeconds",
  "streamTimeoutSeconds",
  "features",
] as const;

/**
 * The AI engine's settings, previously four nav rows. They were never four
 * pages: all four declared `sectionName: "aiEngine"`, so they shared one query
 * key and any save reseeded its siblings' drafts from the server. One page, one
 * draft, one save.
 *
 * The two API-key flags stay separate on purpose. A single shared flag would put
 * the masked sentinel into whichever key the user did not touch and wipe it.
 */
export default function AdminAiSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [embeddingApiKeyDirty, setEmbeddingApiKeyDirty] = useState(false);

  const {
    settings,
    setSettings,
    loading,
    saving,
    saveSettings,
    isFieldPending,
  } = useAdminSettings<AiEngineSettingsData>({
    sectionName: "aiEngine",
    enabled: loginEnabled,
    fetchTransformer: async (): Promise<
      AiEngineSettingsData & { _pending?: Partial<AiEngineSettingsData> }
    > => {
      const response = await apiClient.get<AiEngineApiResponse>(
        "/api/v1/admin/settings/section/aiEngine",
      );
      return response.data || {};
    },
    // The four pages' key sets were disjoint, so the merged transformer is their
    // union - no key is written by two cards.
    saveTransformer: (s: AiEngineSettingsData) => {
      const provider = s.models?.provider || "anthropic";
      const embeddingProvider = s.rag?.embeddingProvider || "voyageai";
      const modelsUseBaseUrl = provider === "ollama" || provider === "custom";
      const ragUsesBaseUrl =
        embeddingProvider === "ollama" || embeddingProvider === "custom";

      const deltaSettings: Record<string, unknown> = {
        "aiEngine.enabled": s.enabled ?? false,
        "aiEngine.url": s.url ?? "",
        // Timeouts must be >= 1s; a 0 would make every engine call fail/deadlock.
        "aiEngine.timeoutSeconds": clampMin(s.timeoutSeconds, 1),
        "aiEngine.longRunningTimeoutSeconds": clampMin(
          s.longRunningTimeoutSeconds,
          1,
        ),
        "aiEngine.streamTimeoutSeconds": clampMin(s.streamTimeoutSeconds, 1),
        "aiEngine.features.chat": s.features?.chat ?? false,
        "aiEngine.features.documentQuestions":
          s.features?.documentQuestions ?? false,
        "aiEngine.features.createPdf": s.features?.createPdf ?? false,
        "aiEngine.features.mathAuditor": s.features?.mathAuditor ?? false,
        "aiEngine.features.pdfComment": s.features?.pdfComment ?? false,
        "aiEngine.features.classify": s.features?.classify ?? false,

        "aiEngine.models.provider": provider,
        "aiEngine.models.smartModel": s.models?.smartModel ?? "",
        "aiEngine.models.fastModel": s.models?.fastModel ?? "",
        "aiEngine.models.smartMaxTokens": clampMin(s.models?.smartMaxTokens, 1),
        "aiEngine.models.fastMaxTokens": clampMin(s.models?.fastMaxTokens, 1),
        // Never send a base URL for a provider that doesn't use one (avoids leaking a
        // stale value left over from a previous Ollama/Custom selection).
        "aiEngine.models.baseUrl": modelsUseBaseUrl
          ? (s.models?.baseUrl ?? "")
          : "",

        "aiEngine.rag.embeddingProvider": embeddingProvider,
        "aiEngine.rag.embeddingModel": s.rag?.embeddingModel ?? "",
        "aiEngine.rag.embeddingBaseUrl": ragUsesBaseUrl
          ? (s.rag?.embeddingBaseUrl ?? "")
          : "",
        "aiEngine.rag.topK": clampMin(s.rag?.topK, 1),
        // Zero is a real value here, unlike every other clamp on this page.
        "aiEngine.rag.maxSearches": clampMin(s.rag?.maxSearches, 0),

        // All must be >= 1; a 0 page/char cap or 0 concurrency breaks the engine.
        "aiEngine.limits.maxPages": clampMin(s.limits?.maxPages, 1),
        "aiEngine.limits.maxCharacters": clampMin(s.limits?.maxCharacters, 1),
        "aiEngine.limits.modelMaxConcurrency": clampMin(
          s.limits?.modelMaxConcurrency,
          1,
        ),
      };

      // Send a key only once the user has typed one, or a provider switch has
      // cleared it; the explicit "" wipes the previous provider's stored key.
      if (apiKeyDirty) {
        deltaSettings["aiEngine.models.apiKey"] =
          provider !== "ollama" ? (s.models?.apiKey ?? "") : "";
      }
      if (embeddingApiKeyDirty) {
        deltaSettings["aiEngine.rag.embeddingApiKey"] =
          embeddingProvider !== "ollama" ? (s.rag?.embeddingApiKey ?? "") : "";
      }
      return { sectionData: {}, deltaSettings };
    },
  });

  const { isDirty, resetToSnapshot, markSaved } = useSettingsDirty(
    settings,
    loading,
  );

  const handleSave = async () => {
    // Read the pre-save state first: markSaved and the refetch both move the
    // snapshot, and the branches below need to know what actually changed.
    const before = resetToSnapshot();
    const changed = (pick: (s: AiEngineSettingsData) => unknown) =>
      JSON.stringify(pick(before)) !== JSON.stringify(pick(settings));
    const needsRestart = RESTART_KEYS.some((k) => changed((s) => s[k]));
    const reindex =
      changed((s) => s.rag?.embeddingModel) ||
      changed((s) => s.rag?.embeddingProvider);

    try {
      await saveSettings();
      setApiKeyDirty(false);
      setEmbeddingApiKeyDirty(false);
      markSaved();
      if (needsRestart) {
        showRestartModal();
        return;
      }
      alert({
        alertType: "success",
        title: t("admin.settings.ai.saved.title", "AI settings saved"),
        body: reindex
          ? `${savedToastBody(settings, t)} ${t(
              "admin.settings.ai.documents.saved.reindexNote",
              "If you changed the embedding model, re-index existing documents so search uses the new model.",
            )}`
          : savedToastBody(settings, t),
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
    setApiKeyDirty(false);
    setEmbeddingApiKeyDirty(false);
  }, [resetToSnapshot, setSettings]);

  if (loginEnabled && loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const card = { settings, setSettings, isFieldPending, loginEnabled };

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <LoginRequiredBanner show={!loginEnabled} />

        <section className="admin-ai__card">
          <h2 className="admin-ai__heading" id="adminAiGeneral">
            {t("admin.settings.ai.general.connection", "Connection")}
          </h2>
          <p className="admin-ai__description">
            {t(
              "admin.settings.ai.general.description",
              "Connect Stirling to the Python AI engine and choose which AI capabilities are exposed. Changes apply on restart.",
            )}
          </p>
          <AiConnectionCard {...card} />
        </section>

        <section className="admin-ai__card">
          <h2 className="admin-ai__heading" id="adminAiCapabilities">
            {t("admin.settings.ai.general.capabilities.title", "Capabilities")}
          </h2>
          <AiCapabilitiesCard {...card} />
        </section>

        <section className="admin-ai__card">
          <h2 className="admin-ai__heading" id="adminAiModels">
            {t("settings.ai.models", "Models & Providers")}
          </h2>
          <p className="admin-ai__description">
            {t(
              "admin.settings.ai.models.description",
              "Choose the LLM provider and the smart/fast models the AI engine uses. Applied to the AI engine when saved.",
            )}
          </p>
          <AiModelsCard
            {...card}
            apiKeyDirty={apiKeyDirty}
            setApiKeyDirty={setApiKeyDirty}
          />
        </section>

        <section className="admin-ai__card">
          <h2 className="admin-ai__heading" id="adminAiDocuments">
            {t("settings.ai.documents", "Documents & RAG")}
          </h2>
          <p className="admin-ai__description">
            {t(
              "admin.settings.ai.documents.description",
              "Configure the embedding model and retrieval settings used to answer questions over documents. Applied to the AI engine when saved.",
            )}
          </p>
          <AiDocumentsCard
            {...card}
            embeddingApiKeyDirty={embeddingApiKeyDirty}
            setEmbeddingApiKeyDirty={setEmbeddingApiKeyDirty}
          />
        </section>

        <section className="admin-ai__card">
          <h2 className="admin-ai__heading" id="adminAiLimits">
            {t("settings.ai.limits", "Limits & Performance")}
          </h2>
          <p className="admin-ai__description">
            {t(
              "admin.settings.ai.limits.description",
              "Guardrails for how much work AI requests may do and how many run concurrently. Applied to the AI engine when saved.",
            )}
          </p>
          <AiLimitsCard {...card} />
        </section>
      </Stack>

      <SettingsStickyFooter
        isDirty={isDirty}
        saving={saving}
        loginEnabled={loginEnabled}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  NumberInput,
  Switch,
  Stack,
  Paper,
  Text,
  Loader,
  Group,
  Alert,
  Code,
} from "@mantine/core";
import { alert } from "@app/components/toast";
import LocalIcon from "@app/components/shared/LocalIcon";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";
import { useRestartServer } from "@app/components/shared/config/useRestartServer";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { useSettingsDirty } from "@app/hooks/useSettingsDirty";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";
import apiClient from "@app/services/apiClient";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import { Button } from "@app/ui/Button";
import {
  AiEngineSettingsData,
  AiEngineFeatures,
  AiEngineApiResponse,
  clampMin,
} from "@app/components/shared/config/configSections/aiEngineSettings";

export default function AdminAiGeneralSection() {
  const { t } = useTranslation();
  const { loginEnabled } = useLoginRequired();
  const {
    restartModalOpened,
    showRestartModal,
    closeRestartModal,
    restartServer,
  } = useRestartServer();

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
      showRestartModal();
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

  const [testingConnection, setTestingConnection] = useState(false);

  // Probe the RUNNING configuration (the Java bean), not unsaved form values -
  // after enabling AI or changing the URL, save + restart first, then test.
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      await apiClient.get("/api/v1/ai/health");
      alert({
        alertType: "success",
        title: t(
          "admin.settings.ai.general.test.okTitle",
          "AI engine reachable",
        ),
        body: t(
          "admin.settings.ai.general.test.okBody",
          "The AI engine responded to a health check.",
        ),
      });
    } catch (error) {
      const detail =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ||
        t(
          "admin.settings.ai.general.test.failBody",
          "The AI engine did not respond. Check the URL, that the engine container is running, and that AI is enabled (a restart is needed after enabling).",
        );
      alert({
        alertType: "error",
        title: t(
          "admin.settings.ai.general.test.failTitle",
          "AI engine unreachable",
        ),
        body: detail,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const setFeatures = (patch: Partial<AiEngineFeatures>) =>
    setSettings({
      ...settings,
      features: { ...(settings.features || {}), ...patch },
    });

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  const enabled = settings.enabled || false;

  return (
    <div className="settings-section-container">
      <Stack gap="lg" className="settings-section-content">
        <div>
          <Text fw={600} size="lg">
            {t("admin.settings.ai.general.title", "AI Engine")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.ai.general.description",
              "Connect Stirling to the Python AI engine and choose which AI capabilities are exposed. Changes apply on restart.",
            )}
          </Text>
        </div>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text fw={500} size="sm">
                  {t("admin.settings.ai.general.enabled.label", "Enable AI")}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t(
                    "admin.settings.ai.general.enabled.description",
                    "Master switch. When off, no AI tools, agents, or engine calls are available.",
                  )}
                </Text>
              </div>
              <Group gap="xs">
                <Switch
                  checked={enabled}
                  onChange={(e) =>
                    setSettings({ ...settings, enabled: e.target.checked })
                  }
                  aria-label={t(
                    "admin.settings.ai.general.enabled.label",
                    "Enable AI",
                  )}
                />
                <PendingBadge show={isFieldPending("enabled")} />
              </Group>
            </Group>

            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.ai.general.url.label", "AI engine URL")}
                  </span>
                  <PendingBadge show={isFieldPending("url")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.general.url.description",
                "Internal URL of the Python AI engine, e.g. http://stirling-pdf-engine:5001.",
              )}
              value={settings.url || ""}
              onChange={(e) =>
                setSettings({ ...settings, url: e.target.value })
              }
              placeholder="http://stirling-pdf-engine:5001"
              disabled={!enabled}
            />

            <Group justify="flex-end">
              <Button
                variant="secondary"
                size="sm"
                loading={testingConnection}
                onClick={handleTestConnection}
              >
                {t("admin.settings.ai.general.test.button", "Test connection")}
              </Button>
            </Group>

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.general.timeoutSeconds.label",
                      "Request timeout (seconds)",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("timeoutSeconds")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.general.timeoutSeconds.description",
                "Timeout for standard AI requests to the engine.",
              )}
              value={settings.timeoutSeconds ?? 0}
              onChange={(value) =>
                setSettings({ ...settings, timeoutSeconds: Number(value) })
              }
              min={1}
              disabled={!enabled}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.general.longRunningTimeoutSeconds.label",
                      "Long-running timeout (seconds)",
                    )}
                  </span>
                  <PendingBadge
                    show={isFieldPending("longRunningTimeoutSeconds")}
                  />
                </Group>
              }
              description={t(
                "admin.settings.ai.general.longRunningTimeoutSeconds.description",
                "Timeout for heavier agent operations such as document generation.",
              )}
              value={settings.longRunningTimeoutSeconds ?? 0}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  longRunningTimeoutSeconds: Number(value),
                })
              }
              min={1}
              disabled={!enabled}
            />

            <NumberInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.ai.general.streamTimeoutSeconds.label",
                      "Stream timeout (seconds)",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("streamTimeoutSeconds")} />
                </Group>
              }
              description={t(
                "admin.settings.ai.general.streamTimeoutSeconds.description",
                "Timeout for streamed (token-by-token) chat responses.",
              )}
              value={settings.streamTimeoutSeconds ?? 0}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  streamTimeoutSeconds: Number(value),
                })
              }
              min={1}
              disabled={!enabled}
            />
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm">
                {t(
                  "admin.settings.ai.general.capabilities.title",
                  "Capabilities",
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "admin.settings.ai.general.capabilities.description",
                  "Turn individual AI features on or off. Disabled features are hidden in the app.",
                )}
              </Text>
            </div>

            <FeatureSwitch
              label={t(
                "admin.settings.ai.general.features.chat.label",
                "Chat assistant",
              )}
              description={t(
                "admin.settings.ai.general.features.chat.description",
                "Conversational assistant for working with PDFs.",
              )}
              checked={settings.features?.chat ?? false}
              onChange={(checked) => setFeatures({ chat: checked })}
              pending={isFieldPending("features.chat")}
              disabled={!enabled}
            />
            <FeatureSwitch
              label={t(
                "admin.settings.ai.general.features.documentQuestions.label",
                "Document questions",
              )}
              description={t(
                "admin.settings.ai.general.features.documentQuestions.description",
                "Ask questions and get answers grounded in an uploaded document.",
              )}
              checked={settings.features?.documentQuestions ?? false}
              onChange={(checked) =>
                setFeatures({ documentQuestions: checked })
              }
              pending={isFieldPending("features.documentQuestions")}
              disabled={!enabled}
            />
            <FeatureSwitch
              label={t(
                "admin.settings.ai.general.features.createPdf.label",
                "Create PDF from prompt",
              )}
              description={t(
                "admin.settings.ai.general.features.createPdf.description",
                "Generate a new PDF (e.g. from HTML) via an AI agent.",
              )}
              checked={settings.features?.createPdf ?? false}
              onChange={(checked) => setFeatures({ createPdf: checked })}
              pending={isFieldPending("features.createPdf")}
              disabled={!enabled}
            />
            <FeatureSwitch
              label={t(
                "admin.settings.ai.general.features.mathAuditor.label",
                "Math auditor",
              )}
              description={t(
                "admin.settings.ai.general.features.mathAuditor.description",
                "Review documents for mathematical and numerical errors.",
              )}
              checked={settings.features?.mathAuditor ?? false}
              onChange={(checked) => setFeatures({ mathAuditor: checked })}
              pending={isFieldPending("features.mathAuditor")}
              disabled={!enabled}
            />
            <FeatureSwitch
              label={t(
                "admin.settings.ai.general.features.pdfComment.label",
                "PDF comment agent",
              )}
              description={t(
                "admin.settings.ai.general.features.pdfComment.description",
                "Add AI-authored review comments and annotations to a PDF.",
              )}
              checked={settings.features?.pdfComment ?? false}
              onChange={(checked) => setFeatures({ pdfComment: checked })}
              pending={isFieldPending("features.pdfComment")}
              disabled={!enabled}
            />
            <FeatureSwitch
              label={t(
                "admin.settings.ai.general.features.classify.label",
                "Document classification",
              )}
              description={t(
                "admin.settings.ai.general.features.classify.description",
                "Automatically categorise documents by type or content.",
              )}
              checked={settings.features?.classify ?? false}
              onChange={(checked) => setFeatures({ classify: checked })}
              pending={isFieldPending("features.classify")}
              disabled={!enabled}
            />
          </Stack>
        </Paper>

        <Alert
          variant="light"
          color="blue"
          title={t(
            "admin.settings.ai.general.note.title",
            "About the AI engine",
          )}
          icon={<LocalIcon icon="info-rounded" width="1rem" height="1rem" />}
        >
          <Text size="xs">
            {t(
              "admin.settings.ai.general.note.body",
              "The AI engine runs as a separate service. Its shared secret",
            )}{" "}
            <Code>STIRLING_ENGINE_SHARED_SECRET</Code>{" "}
            {t(
              "admin.settings.ai.general.note.body2",
              "is set via a container environment variable. Provider API keys can be entered on these pages or supplied as engine environment variables; keys entered here are pushed to the engine when saved.",
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

      <RestartConfirmationModal
        opened={restartModalOpened}
        onClose={closeRestartModal}
        onRestart={restartServer}
      />
    </div>
  );
}

interface FeatureSwitchProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  pending: boolean;
  disabled: boolean;
}

function FeatureSwitch({
  label,
  description,
  checked,
  onChange,
  pending,
  disabled,
}: FeatureSwitchProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <div>
        <Text fw={500} size="sm">
          {label}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          {description}
        </Text>
      </div>
      <Group gap="xs">
        <Switch
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          // The visible label is a sibling Text, so the control needs its own name.
          aria-label={label}
        />
        <PendingBadge show={pending} />
      </Group>
    </Group>
  );
}

import { useTranslation } from "react-i18next";
import { Stack, Paper, Text, Group, Switch } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { AiEngineFeatures } from "@app/components/shared/config/configSections/aiEngineSettings";
import type { AiCardProps } from "@app/components/shared/config/configSections/ai/aiCardProps";

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

/** Which AI features are on. Every key here needs a restart to take effect. */
export function AiCapabilitiesCard({
  settings,
  setSettings,
  isFieldPending,
}: AiCardProps) {
  const { t } = useTranslation();

  const enabled = settings.enabled || false;
  const setFeatures = (patch: Partial<AiEngineFeatures>) =>
    setSettings({
      ...settings,
      features: { ...(settings.features || {}), ...patch },
    });

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Text fw={600} size="sm">
            {t("admin.settings.ai.general.capabilities.title", "Capabilities")}
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
          onChange={(checked) => setFeatures({ documentQuestions: checked })}
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
  );
}

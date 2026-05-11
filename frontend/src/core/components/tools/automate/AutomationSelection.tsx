import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Title, Stack, Divider } from "@mantine/core";
import AddCircleOutline from "@mui/icons-material/AddCircleOutlined";
import SettingsIcon from "@mui/icons-material/Settings";
import AutomationEntry from "@app/components/tools/automate/AutomationEntry";
import AutomationImportModal from "@app/components/tools/automate/AutomationImportModal";
import { useSuggestedAutomations } from "@app/hooks/tools/automate/useSuggestedAutomations";
import { AutomationConfig, SuggestedAutomation } from "@app/types/automation";
import { iconMap } from "@app/components/tools/automate/iconMap";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import {
  downloadAutomationConfig,
  downloadFolderScanningConfig,
} from "@app/utils/automationConverter";
import type { ImportableAutomation } from "@app/hooks/tools/automate/useSavedAutomations";

interface AutomationSelectionProps {
  savedAutomations: AutomationConfig[];
  onCreateNew: () => void;
  onRun: (automation: AutomationConfig) => void;
  onEdit: (automation: AutomationConfig) => void;
  onDelete: (automation: AutomationConfig) => void;
  onCopyFromSuggested: (automation: SuggestedAutomation) => void;
  onImportAutomation: (
    automation: ImportableAutomation,
  ) => Promise<AutomationConfig>;
  onImportError?: (message: string) => void;
  onImportSuccess?: (message: string) => void;
  toolRegistry: Partial<ToolRegistry>;
}

export default function AutomationSelection({
  savedAutomations,
  onCreateNew,
  onRun,
  onEdit,
  onDelete,
  onCopyFromSuggested,
  onImportAutomation,
  onImportError,
  onImportSuccess,
  toolRegistry,
}: AutomationSelectionProps) {
  const { t } = useTranslation();
  const suggestedAutomations = useSuggestedAutomations();

  const [importModalOpen, setImportModalOpen] = useState(false);

  const handleImportSubmit = async (
    automation: ImportableAutomation,
    meta: { format: "automate" | "folderScanning"; unresolved: string[] },
  ) => {
    try {
      await onImportAutomation(automation);
      setImportModalOpen(false);
      if (meta.unresolved.length > 0) {
        onImportSuccess?.(
          t(
            "automate.importPartialSuccess",
            "Imported with {{count}} unmapped operation(s): {{ops}}",
            {
              count: meta.unresolved.length,
              ops: meta.unresolved.join(", "),
            },
          ),
        );
      } else {
        onImportSuccess?.(
          t("automate.importSuccess", "Imported automation: {{name}}", {
            name: automation.name,
          }),
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import automation";
      console.error("Failed to import automation:", err);
      onImportError?.(message);
    }
  };

  return (
    <div>
      <Title
        order={3}
        size="h4"
        fw={600}
        mb="md"
        style={{ color: "var(--mantine-color-dimmed)" }}
      >
        {t("automate.selection.saved.title", "Saved")}
      </Title>

      <Stack gap="xs">
        <AutomationEntry
          title={t(
            "automate.selection.createNew.title",
            "Create New Automation",
          )}
          badgeIcon={AddCircleOutline}
          operations={[]}
          onClick={onCreateNew}
          keepIconColor={true}
          showMenu={true}
          onImport={() => setImportModalOpen(true)}
          toolRegistry={toolRegistry}
        />
        {/* Saved Automations */}
        {savedAutomations.map((automation) => {
          const IconComponent = automation.icon
            ? iconMap[automation.icon as keyof typeof iconMap]
            : SettingsIcon;
          return (
            <AutomationEntry
              key={automation.id}
              title={automation.name}
              description={automation.description}
              badgeIcon={IconComponent || SettingsIcon}
              operations={automation.operations.map((op) =>
                typeof op === "string" ? op : op.operation,
              )}
              onClick={() => onRun(automation)}
              showMenu={true}
              onEdit={() => onEdit(automation)}
              onExportAutomation={() => downloadAutomationConfig(automation)}
              onExportFolderScan={() =>
                downloadFolderScanningConfig(automation, toolRegistry)
              }
              onDelete={() => onDelete(automation)}
              toolRegistry={toolRegistry}
            />
          );
        })}
        <Divider pb="sm" />

        {/* Suggested Automations */}
        <div>
          <Title
            order={3}
            size="h4"
            fw={600}
            mb="md"
            style={{ color: "var(--mantine-color-dimmed)" }}
          >
            {t("automate.selection.suggested.title", "Suggested")}
          </Title>
          <Stack gap="xs">
            {suggestedAutomations.map((automation) => (
              <AutomationEntry
                key={automation.id}
                title={automation.name}
                description={automation.description}
                badgeIcon={automation.icon}
                operations={automation.operations.map((op) => op.operation)}
                onClick={() => onRun(automation)}
                showMenu={true}
                onCopy={() => onCopyFromSuggested(automation)}
                toolRegistry={toolRegistry}
              />
            ))}
          </Stack>
        </div>
      </Stack>

      <AutomationImportModal
        opened={importModalOpen}
        toolRegistry={toolRegistry}
        onCancel={() => setImportModalOpen(false)}
        onImport={handleImportSubmit}
      />
    </div>
  );
}

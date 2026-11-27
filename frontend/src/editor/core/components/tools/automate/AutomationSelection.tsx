import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VisuallyHidden } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import AutomationEntry from "@editor/components/tools/automate/AutomationEntry";
import AutomatePanelHeader from "@editor/components/tools/automate/AutomatePanelHeader";
import AutomationImportModal from "@editor/components/tools/automate/AutomationImportModal";
import type { AutomationAction } from "@editor/components/tools/automate/AutomationActionsMenu";
import { useSuggestedAutomations } from "@editor/hooks/tools/automate/useSuggestedAutomations";
import { useActivityAutomations } from "@editor/hooks/tools/automate/useActivityAutomations";
import { useActivityChainText } from "@editor/hooks/useToolWorkflowSuggestions";
import {
  AutomationConfig,
  SuggestedAutomation,
} from "@editor/types/automation";
import { iconMap } from "@editor/components/tools/automate/iconMap";
import { iconKeyForSuggestedAutomation } from "@editor/components/tools/automate/suggestedAutomationIcon";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ActivityChain } from "@editor/utils/activityChains";
import type { ImportableAutomation } from "@editor/hooks/tools/automate/useSavedAutomations";
import classes from "@editor/components/tools/automate/Automate.module.css";

interface AutomationSelectionProps {
  savedAutomations: AutomationConfig[];
  onCreateNew: () => void;
  onOpenSaved: (automation: AutomationConfig) => void;
  onOpenSuggested: (automation: AutomationConfig) => void;
  /** Row-menu actions for a saved automation. */
  savedActions: (automation: AutomationConfig) => AutomationAction[];
  /** Row-menu actions for a suggestion. */
  suggestedActions: (automation: AutomationConfig) => AutomationAction[];
  onCreateFromActivity: (automation: AutomationConfig) => void;
  onImportAutomation: (
    automation: ImportableAutomation,
  ) => Promise<AutomationConfig>;
  onImportError?: (message: string) => void;
  onImportSuccess?: (message: string) => void;
  toolRegistry: Partial<ToolRegistry>;
}

/** Suggested automations carry an icon name; the run and save paths store an iconMap key. */
function suggestedAsConfig(automation: SuggestedAutomation): AutomationConfig {
  return { ...automation, icon: iconKeyForSuggestedAutomation(automation.id) };
}

export default function AutomationSelection({
  savedAutomations,
  onCreateNew,
  onOpenSaved,
  onOpenSuggested,
  savedActions,
  suggestedActions,
  onCreateFromActivity,
  onImportAutomation,
  onImportError,
  onImportSuccess,
  toolRegistry,
}: AutomationSelectionProps) {
  const { t } = useTranslation();
  const suggestedAutomations = useSuggestedAutomations();
  const existingOperationLists = useMemo(
    () =>
      [...savedAutomations, ...suggestedAutomations].map((automation) =>
        automation.operations.map((op) =>
          typeof op === "string" ? op : op.operation,
        ),
      ),
    [savedAutomations, suggestedAutomations],
  );
  const activityChains = useActivityAutomations(
    toolRegistry,
    existingOperationLists,
  );

  const {
    name: activityChainName,
    ranBy,
    draftName,
  } = useActivityChainText(toolRegistry);

  const activityChainConfig = (chain: ActivityChain): AutomationConfig => {
    const now = new Date().toISOString();
    return {
      id: `activity-${chain.operations.join("-")}`,
      name: draftName(chain),
      icon: "SettingsIcon",
      operations: chain.operations.map((operation) => ({
        operation,
        parameters: {},
      })),
      createdAt: now,
      updatedAt: now,
    };
  };

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
    <>
      <AutomatePanelHeader
        title={t("automate.library.title", "Automations")}
        fixedTitle
        actions={
          <>
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              px="xs"
              leftSection={<Icon name="file-up" size={14} />}
              onClick={() => setImportModalOpen(true)}
            >
              {t("automate.import", "Import")}
            </Button>
            <Button
              size="sm"
              px="sm"
              leftSection={<Icon name="plus" size={14} />}
              onClick={onCreateNew}
            >
              {t("automate.library.new", "New")}
            </Button>
          </>
        }
      />

      {savedAutomations.length > 0 && (
        <section className={classes.section}>
          <h3 className={classes.sectionLabel}>
            {t("automate.selection.saved.title", "Saved")}
            <VisuallyHidden>, </VisuallyHidden>
            <span className={classes.sectionCount}>
              {savedAutomations.length}
            </span>
          </h3>
          {savedAutomations.map((automation) => (
            <AutomationEntry
              key={automation.id}
              title={automation.name}
              badgeIcon={
                (automation.icon && iconMap[automation.icon]) ||
                iconMap.SettingsIcon
              }
              onClick={() => onOpenSaved(automation)}
              actions={savedActions(automation)}
              description={automation.description}
              operations={automation.operations.map((op) =>
                typeof op === "string" ? op : op.operation,
              )}
              toolRegistry={toolRegistry}
            />
          ))}
        </section>
      )}

      {activityChains.length > 0 && (
        <section className={classes.section}>
          <h3 className={classes.sectionLabel}>
            {t("automate.selection.activity.title", "Frequent workflows")}
          </h3>
          {activityChains.map((chain) => (
            <AutomationEntry
              key={chain.operations.join("-")}
              title={activityChainName(chain)}
              badgeIcon="activity"
              onClick={() => onCreateFromActivity(activityChainConfig(chain))}
              description={`${ranBy(chain)} ${t(
                "automate.selection.activity.description",
                "Save it as an automation and run it with one click.",
              )}`}
              operations={chain.operations}
              toolRegistry={toolRegistry}
            />
          ))}
        </section>
      )}

      <section className={classes.section}>
        <h3 className={classes.sectionLabel}>
          {t("automate.selection.suggested.title", "Suggested")}
        </h3>
        {suggestedAutomations.map((automation) => {
          const config = suggestedAsConfig(automation);
          return (
            <AutomationEntry
              key={automation.id}
              title={automation.name}
              badgeIcon={automation.icon}
              onClick={() => onOpenSuggested(config)}
              actions={suggestedActions(config)}
              description={config.description}
              operations={automation.operations.map((op) => op.operation)}
              toolRegistry={toolRegistry}
            />
          );
        })}
      </section>

      <AutomationImportModal
        opened={importModalOpen}
        toolRegistry={toolRegistry}
        onCancel={() => setImportModalOpen(false)}
        onImport={handleImportSubmit}
      />
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@app/ui/Modal";
import { CardRail } from "@app/ui/CardRail";
import { folderKind } from "@app/types/folder";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type PolicySetupResult,
} from "@app/policies/catalog";
import { PipelineTemplateCard } from "@app/components/policies/PipelineTemplateCard";
import { PolicySetupWizard } from "@app/components/policies/PolicySetupWizard";
import { Button } from "@app/ui/Button";
import {
  saveProcessingFolder,
  type ProcessingFolderStep,
} from "@app/services/processingFolderApi";
import {
  refreshProcessingFolders,
  useProcessingFolders,
} from "@app/hooks/useProcessingFolders";
import { policyStepFromWire } from "@app/policies/operations";
import type { WirePipelineStep } from "@app/policies/types";
import {
  currentRunIds,
  deliverSweepResults,
} from "@app/services/processingRunDelivery";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import type { FolderProcessingSetupProps } from "@core/components/policies/FolderProcessingSetup";
import "@app/components/policies/FolderProcessingSetup.css";

export type { FolderProcessingSetupProps };

/**
 * The setup flow behind "Process files in this folder": the same guided wizard Processor uses,
 * with the source (this folder) and the output placement already decided, so neither is asked.
 */
export function FolderProcessingSetup({
  folder,
  onClose,
}: FolderProcessingSetupProps) {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const aiEngineEnabled = useAiEngineEnabled();
  const { recordFor } = useProcessingFolders();
  const [wizardEntry, setWizardEntry] = useState<CatalogueEntry | null>(null);

  // The same catalogue Processor's gallery assembles, with no saved-policy
  // decoration: a folder setup always starts from the template.
  const entries = useMemo<CatalogueEntry[]>(
    () =>
      POLICY_CATEGORIES.flatMap((category) => {
        const config = POLICY_CONFIG[category.id];
        return config ? [{ category, config, policy: null }] : [];
      }),
    [],
  );

  // Editing: a folder that already has a record opens the wizard directly,
  // seeded from its saved steps, under the category whose preset covers them.
  const existing = folder ? recordFor(folder) : undefined;
  const existingId = existing?.id;
  useEffect(() => {
    if (!folder || !existing) return;
    const savedToolIds = existing.steps
      .map((step) => policyStepFromWire(step as WirePipelineStep)?.toolId)
      .filter((id): id is NonNullable<typeof id> => id != null);
    const category =
      POLICY_CATEGORIES.find((c) => {
        const preset = new Set(
          (POLICY_CONFIG[c.id]?.defaultOperations ?? []).map((op) => op.toolId),
        );
        return (
          savedToolIds.length > 0 && savedToolIds.every((id) => preset.has(id))
        );
      }) ?? POLICY_CATEGORIES.find((c) => c.id === "classification")!;
    const config = POLICY_CONFIG[category.id];
    setWizardEntry({
      category,
      config,
      policy: {
        category,
        config,
        state: {
          configured: true,
          status: existing.enabled ? "active" : "paused",
          required: false,
          sources: [],
          scopeTypes: [],
          reviewerEmail: "",
          fieldValues: {},
        },
        steps: existing.steps as WirePipelineStep[],
        stats: { enforced: 0, dataProcessed: "—", activeFor: "—" },
        activity: [],
      },
    });
    // Re-seed only when the dialog opens for a folder, not on list refreshes mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder?.id, existingId]);

  if (!folder) return null;

  const close = () => {
    setWizardEntry(null);
    onClose();
  };

  const submit = async (_entry: CatalogueEntry, result: PolicySetupResult) => {
    // The wizard's steps are already wire-shaped; the pair route additionally
    // expects `parameters` present on every step.
    const steps: ProcessingFolderStep[] = result.steps.map((step) => ({
      ...step,
      parameters: step.parameters ?? {},
    }));
    const onDisk = folderKind(folder) === "local";
    // Captured before the save so the delivery ignores runs from earlier sweeps.
    const baseline = existing
      ? await currentRunIds(existing.id)
      : new Set<string>();
    // Editing keeps the record's identity and its paused/active state; only
    // the steps change. A fresh setup starts enabled.
    const saved = await saveProcessingFolder(
      onDisk
        ? {
            id: existing?.id,
            directory: folder.directory ?? "",
            enabled: existing ? existing.enabled : true,
            steps,
          }
        : {
            id: existing?.id,
            folderId: folder.id as string,
            enabled: existing ? existing.enabled : true,
            steps,
            output: { mode: "new_version" },
          },
    );
    void refreshProcessingFolders();
    // A mount's results land on disk where nothing shows them; pull them into
    // the workbench as they settle. Storage results replace in place.
    if (onDisk) {
      void deliverSweepResults(saved.id, null, addFiles, {
        excludeRunIds: baseline,
      });
    }
    close();
  };

  if (wizardEntry) {
    // The wizard supplies the middle; this dialog stays the frame.
    return (
      <PolicySetupWizard
        entry={wizardEntry}
        onClose={() => setWizardEntry(null)}
        onSubmit={submit}
        enforceControl={false}
      >
        {({ content, submit: startProcessing, submitting, canSubmit }) => (
          <Modal
            open
            onClose={submitting ? () => {} : close}
            width="lg"
            title={t("filesPage.processingSetup.title", "Process '{{name}}'", {
              name: folder.name,
            })}
            subtitle={t(wizardEntry.category.label, wizardEntry.category.id)}
            footer={
              <div className="folder-setup__foot">
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => (existing ? close() : setWizardEntry(null))}
                  disabled={submitting}
                >
                  {existing
                    ? t("filesPage.processingSetup.cancel", "Cancel")
                    : t("filesPage.processingSetup.back", "Back")}
                </Button>
                <Button
                  size="sm"
                  style={{ marginLeft: "auto" }}
                  onClick={startProcessing}
                  loading={submitting}
                  disabled={!canSubmit}
                >
                  {t("filesPage.processingSetup.start", "Start processing")}
                </Button>
              </div>
            }
          >
            {content}
          </Modal>
        )}
      </PolicySetupWizard>
    );
  }

  return (
    <Modal
      open
      onClose={close}
      width="lg"
      title={t("filesPage.processingSetup.title", "Process '{{name}}'", {
        name: folder.name,
      })}
    >
      <p className="folder-setup__lead">
        {t(
          "filesPage.processingSetup.lead",
          "Anything added to this folder runs these steps, in place - each file becomes its processed version.",
        )}
      </p>
      <CardRail itemWidth="16rem" itemHeight="10.75rem">
        {entries.map((entry) => (
          <PipelineTemplateCard
            key={entry.category.id}
            entry={entry}
            onOpen={setWizardEntry}
            locked={
              entry.category.requiresAiEngine === true && !aiEngineEnabled
            }
            lockedLabel={t(
              "portal.policies.card.requiresAiEngine",
              "Requires AI engine",
            )}
          />
        ))}
      </CardRail>
    </Modal>
  );
}

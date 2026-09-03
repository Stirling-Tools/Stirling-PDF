import { useMemo, useState } from "react";
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
import {
  saveProcessingFolder,
  type ProcessingFolderStep,
} from "@app/services/processingFolderApi";
import { refreshProcessingFolders } from "@app/hooks/useProcessingFolders";
import { deliverSweepResults } from "@app/services/processingRunDelivery";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import type { FolderProcessingSetupProps } from "@core/components/policies/FolderProcessingSetup";
import "@app/components/policies/FolderProcessingSetup.css";

export type { FolderProcessingSetupProps };

/**
 * The setup flow behind "Process files in this folder": the pipeline templates
 * gallery into the same guided wizard Processor uses, verbatim. The only
 * difference is that the source (this folder) and the output placement (beside
 * the originals for a mount, new versions in place for a storage folder) are
 * already decided, so neither is asked for.
 */
export function FolderProcessingSetup({
  folder,
  onClose,
}: FolderProcessingSetupProps) {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const aiEngineEnabled = useAiEngineEnabled();
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
    const saved = await saveProcessingFolder(
      onDisk
        ? { directory: folder.directory ?? "", enabled: true, steps }
        : {
            folderId: folder.id as string,
            enabled: true,
            steps,
            output: { mode: "new_version" },
          },
    );
    void refreshProcessingFolders();
    // A mount's results land on disk where nothing shows them; pull them into
    // the workbench as they settle. Storage results replace in place.
    if (onDisk && saved.startedRuns > 0) {
      void deliverSweepResults(saved.id, saved.startedRuns, addFiles);
    }
    close();
  };

  if (wizardEntry) {
    return (
      <PolicySetupWizard
        entry={wizardEntry}
        onClose={() => setWizardEntry(null)}
        onSubmit={submit}
        enforceControl={false}
      />
    );
  }

  return (
    <Modal
      open
      onClose={close}
      width="lg"
      title={t("filesPage.processingSetup.title", "Process “{{name}}”", {
        name: folder.name,
      })}
    >
      <p className="folder-setup__lead">
        {t(
          "filesPage.processingSetup.lead",
          "Anything added to this folder runs these steps, in place — each file becomes its processed version.",
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

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useServerFolderBlock } from "@app/hooks/useServerFolderBlock";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import {
  useProcessingFolders,
  refreshProcessingFolders,
} from "@app/hooks/useProcessingFolders";
import { canPickDirectory, pickDirectory } from "@app/services/directoryPicker";
import { saveProcessingFolder } from "@app/services/processingFolderApi";
import {
  currentRunIds,
  deliverSweepResults,
} from "@app/services/processingRunDelivery";
import { folderKind, type FolderRecord } from "@app/types/folder";
import type { PolicySetupResult } from "@app/policies/catalog";
import {
  mergeFolderSteps,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";
import { ProcessingFolderWizard } from "@app/components/policies/ProcessingFolderWizard";

interface ProcessingFolderSetupFlowProps {
  folder?: FolderRecord;
  onClose: () => void;
}

/** Binds both wizard entry points to folder storage and the existing processing service. */
export function ProcessingFolderSetupFlow({
  folder,
  onClose,
}: ProcessingFolderSetupFlowProps) {
  const { t } = useTranslation();
  const folders = useFolders();
  const processing = useProcessingFolders();
  const { addFiles } = useFileHandler();
  const serverDisabledReason = useServerFolderBlock();
  const aiEngineEnabled = useAiEngineEnabled();
  const navigate = useNavigate();

  async function resolveTarget(
    target: ProcessingFolderTarget,
  ): Promise<FolderRecord> {
    if (target.kind === "existing") return target.folder;
    if (target.kind === "server")
      return folders.createFolder(
        target.name.trim(),
        target.parentId,
        "server",
      );
    const mounted = await folders.mountLocalFolder(
      target.directory.path,
      target.directory.name,
    );
    return target.name === null
      ? mounted
      : folders.createFolder(target.name.trim(), mounted.id);
  }

  async function save(selected: FolderRecord, result: PolicySetupResult) {
    const existing = processing.recordFor(selected);
    const onDisk = folderKind(selected) === "local";
    const baseline =
      onDisk && existing ? await currentRunIds(existing.id) : new Set<string>();
    const saved = await saveProcessingFolder({
      id: existing?.id,
      ...(onDisk
        ? { directory: selected.directory }
        : { folderId: selected.id, output: { mode: "new_version" } }),
      enabled: existing ? existing.enabled : true,
      steps: mergeFolderSteps(existing, result.steps).map((step) => ({
        ...step,
        parameters: step.parameters ?? {},
      })),
    });
    void refreshProcessingFolders();
    if (onDisk)
      void deliverSweepResults(saved.id, null, addFiles, {
        excludeRunIds: baseline,
      });
    onClose();
    if (!folder) navigate(`/files/${selected.id}`);
  }

  return (
    <ProcessingFolderWizard
      initialFolder={folder}
      aiEngineEnabled={aiEngineEnabled}
      folders={folders.folders}
      loading={folders.loading || processing.loading}
      loadError={processing.loadError}
      onRetry={() => void refreshProcessingFolders()}
      canPickDirectory={canPickDirectory}
      pickDirectory={pickDirectory}
      serverDisabledReason={serverDisabledReason}
      serverLabel={t("processingFolders.setup.server")}
      recordFor={processing.recordFor}
      resolveTarget={resolveTarget}
      save={save}
      onClose={onClose}
    />
  );
}

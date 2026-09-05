import { useCallback } from "react";
import { AddAttachmentsParameters } from "@app/hooks/tools/addAttachments/useAddAttachmentsParameters";
import { useAttachmentManager } from "@app/hooks/tools/addAttachments/useAttachmentManager";
import { AttachmentManagerUI } from "@app/components/tools/addAttachments/AttachmentManagerUI";
import { useFileContext } from "@app/contexts/FileContext";

interface AddAttachmentsSettingsProps {
  parameters: AddAttachmentsParameters;
  onParameterChange: <K extends keyof AddAttachmentsParameters>(
    key: K,
    value: AddAttachmentsParameters[K],
  ) => void;
  disabled?: boolean;
  activeFile?: File | null;
  onFileUpdated?: (file: File) => void;
  onError?: (errorMessage: string) => void;
}

const AddAttachmentsSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  activeFile = null,
  onFileUpdated,
  onError,
}: AddAttachmentsSettingsProps) => {
  const { addFiles } = useFileContext();

  const handleFileUpdated = useCallback(
    async (updatedFile: File) => {
      await addFiles([updatedFile], {
        selectFiles: true,
      });
      onFileUpdated?.(updatedFile);
    },
    [addFiles, onFileUpdated],
  );

  const manager = useAttachmentManager({
    activeFile,
    onFileUpdated: handleFileUpdated,
    onError,
  });

  const handleStageFiles = (files: File[]) => {
    manager.stageFiles(files);
    const updatedStaged = [...(parameters?.attachments || []), ...files];
    onParameterChange("attachments", updatedStaged);
  };

  const handleSaveDraft = async () => {
    const success = await manager.saveDraft(parameters.convertToPdfA3b);
    if (success) {
      onParameterChange("attachments", []);
    }
  };

  return (
    <AttachmentManagerUI
      rows={manager.rows}
      hasChanges={manager.hasChanges}
      pendingChangesCount={manager.pendingChangesCount}
      isLoading={manager.isLoading}
      isSaving={manager.isSaving}
      isDownloading={manager.isDownloading}
      activeAction={manager.activeAction}
      convertToPdfA3b={parameters?.convertToPdfA3b || false}
      disabled={disabled}
      onStageFiles={handleStageFiles}
      onToggleDeleteRow={manager.toggleDeleteRow}
      onRestoreRow={manager.restoreRow}
      onRenameRow={manager.renameRow}
      onExtractSingle={manager.extractSingle}
      onExtractAllZip={manager.extractAllZip}
      onSaveDraft={handleSaveDraft}
      onDiscardDraft={manager.discardDraft}
      onConvertToPdfA3bChange={(val) =>
        onParameterChange("convertToPdfA3b", val)
      }
    />
  );
};

export default AddAttachmentsSettings;

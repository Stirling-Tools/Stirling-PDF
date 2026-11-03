import { useCallback } from "react";
import { AddAttachmentsParameters } from "@editor/hooks/tools/addAttachments/useAddAttachmentsParameters";
import { useAttachmentManager } from "@editor/hooks/tools/addAttachments/useAttachmentManager";
import { AttachmentManagerUI } from "@editor/components/tools/addAttachments/AttachmentManagerUI";
import {
  AttachmentPinOverlay,
  type AttachmentPinMarker,
} from "@editor/components/tools/addAttachments/AttachmentPinOverlay";

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
  const handleFileUpdated = useCallback(
    (updatedFile: File) => {
      onFileUpdated?.(updatedFile);
    },
    [onFileUpdated],
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

  /** Save the staged batch and clear the automation-only attachment list. */
  const handleSaveDraft = async () => {
    const success = await manager.saveDraft(parameters.convertToPdfA3b);
    if (success) {
      onParameterChange("attachments", []);
    }
  };

  const targetRow =
    manager.rows.find((row) => row.id === manager.placingPinId) ?? null;
  const pins: AttachmentPinMarker[] = manager.rows.flatMap((row) =>
    row.pin && row.kind !== "deleted"
      ? [
          {
            id: row.id,
            name: row.name,
            openName: row.kind === "staged" ? undefined : row.originalName,
            ...row.pin,
          },
        ]
      : [],
  );

  return (
    <>
      <AttachmentManagerUI
        rows={manager.rows}
        hasChanges={manager.hasChanges}
        pendingChangesCount={manager.pendingChangesCount}
        isLoading={manager.isLoading}
        isSaving={manager.isSaving}
        activeAction={manager.activeAction}
        convertToPdfA3b={parameters?.convertToPdfA3b || false}
        placingPinId={manager.placingPinId}
        disabled={disabled}
        onStageFiles={handleStageFiles}
        onToggleDeleteRow={manager.toggleDeleteRow}
        onRestoreRow={manager.restoreRow}
        onRenameRow={manager.renameRow}
        onExtractSingle={manager.extractSingle}
        onExtractAllZip={manager.extractAllZip}
        onStartPinPlacement={manager.startPinPlacement}
        onClearPin={manager.clearPin}
        onSaveDraft={handleSaveDraft}
        onDiscardDraft={manager.discardDraft}
        onConvertToPdfA3bChange={(val) =>
          onParameterChange("convertToPdfA3b", val)
        }
      />
      <AttachmentPinOverlay
        target={targetRow ? { id: targetRow.id, name: targetRow.name } : null}
        pins={pins}
        onPlace={manager.placePin}
        onOpenPin={(filename) => void manager.extractSingle(filename)}
        onCancel={manager.cancelPinPlacement}
      />
    </>
  );
};

export default AddAttachmentsSettings;

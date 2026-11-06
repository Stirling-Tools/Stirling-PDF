import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  listAttachments,
  applyBatchAttachmentOps,
  extractAttachments as apiExtractAttachments,
  extractSingleAttachment as apiExtractSingleAttachment,
  parseBlobError,
  type AttachmentPin,
} from "@editor/services/attachmentService";
import { downloadFileWithPolicy } from "@editor/services/exportWithPolicy";

export type DraftRowKind = "existing" | "staged" | "renamed" | "deleted";

export interface DraftAttachmentRow {
  id: string;
  originalName: string;
  name: string;
  size?: number;
  contentType?: string;
  kind: DraftRowKind;
  file?: File;
  /** Fetch generation this row was staged in, so a late list response can keep it. */
  stagedGen?: number;
  /** Clickable page pin that opens this attachment. */
  pin?: AttachmentPin;
}

interface UseAttachmentManagerOptions {
  activeFile: File | null;
  onFileUpdated?: (updatedFile: File) => void;
  onError?: (errorMessage: string) => void;
}

function createUpdatedFile(blob: Blob, originalFile: File): File {
  return new File([blob], originalFile.name, {
    type: originalFile.type || "application/pdf",
    lastModified: Date.now(),
  });
}

// A staged row's File carries its original name; rename before upload so the
// embedded attachment keeps the name the user chose.
function rebuildStagedFile(
  file: File | undefined,
  newName: string,
): File | undefined {
  if (!file) return file;
  return new File([file], newName, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function useAttachmentManager({
  activeFile,
  onFileUpdated,
  onError,
}: UseAttachmentManagerOptions) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DraftAttachmentRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [placingPinId, setPlacingPinId] = useState<string | null>(null);
  /** Row ids whose saved pin should be removed; names resolve at save time. */
  const [pinRemovalRowIds, setPinRemovalRowIds] = useState<string[]>([]);
  const [pinDirty, setPinDirty] = useState<boolean>(false);

  // Generation counter to prevent race conditions on fast file switches
  const genRef = useRef<number>(0);
  const skipNextFetchRef = useRef<boolean>(false);
  const activeFileRef = useRef<File | null>(activeFile);
  activeFileRef.current = activeFile;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const prevActiveFileKeyRef = useRef<string | null>(null);

  // Stable string identifier for activeFile
  const activeFileKey = activeFile
    ? `${activeFile.name}-${activeFile.size}-${activeFile.lastModified}`
    : "";

  const fetchAttachmentsForFile = useCallback(async (file: File | null) => {
    setPlacingPinId(null);
    setPinRemovalRowIds([]);
    setPinDirty(false);
    if (!file) {
      setRows([]);
      return;
    }
    const currentGen = ++genRef.current;
    setIsLoading(true);
    try {
      const list = await listAttachments(file);
      if (currentGen !== genRef.current) return;
      const initialRows: DraftAttachmentRow[] = list.map((att, idx) => ({
        id: `existing-${att.filename}-${idx}`,
        originalName: att.filename,
        name: att.filename,
        size: att.size,
        contentType: att.contentType,
        kind: "existing",
        pin:
          att.pinPageIndex != null && att.pinX != null && att.pinY != null
            ? {
                pageIndex: att.pinPageIndex,
                x: att.pinX,
                y: att.pinY,
              }
            : undefined,
      }));
      // A user can pick files while the list request is in flight; keep the
      // rows staged for this generation instead of dropping them on the floor.
      setRows((prev) => [
        ...initialRows,
        ...prev.filter(
          (row) => row.kind === "staged" && row.stagedGen === currentGen,
        ),
      ]);
    } catch (err) {
      if (currentGen !== genRef.current) return;
      setRows([]);
      const msg = await parseBlobError(err, "Failed to load attachments.");
      onErrorRef.current?.(msg);
    } finally {
      if (currentGen === genRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      prevActiveFileKeyRef.current = activeFileKey;
      return;
    }

    if (prevActiveFileKeyRef.current !== activeFileKey) {
      prevActiveFileKeyRef.current = activeFileKey;
      fetchAttachmentsForFile(activeFileRef.current);
    }
  }, [activeFileKey, fetchAttachmentsForFile]);

  const stageFiles = useCallback(
    (newFiles: File[]) => {
      setRows((prev) => {
        const existingNames = new Set(
          prev
            .filter((r) => r.kind !== "deleted")
            .map((r) => r.name.toLowerCase()),
        );

        const validNewRows: DraftAttachmentRow[] = [];
        for (let idx = 0; idx < newFiles.length; idx++) {
          const file = newFiles[idx];
          if (existingNames.has(file.name.toLowerCase())) {
            onError?.(
              t(
                "attachments.duplicateName",
                "Attachment with name '{{name}}' already exists.",
                {
                  name: file.name,
                },
              ),
            );
            continue;
          }
          existingNames.add(file.name.toLowerCase());
          validNewRows.push({
            id: `staged-${file.name}-${file.size}-${Date.now()}-${idx}`,
            originalName: file.name,
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            kind: "staged",
            file,
            stagedGen: genRef.current,
          });
        }
        return [...prev, ...validNewRows];
      });
    },
    [onError, t],
  );

  const toggleDeleteRow = useCallback((id: string) => {
    setRows((prev) =>
      prev
        .filter((row) => !(row.id === id && row.kind === "staged"))
        .map((row) => {
          if (row.id !== id) return row;
          if (row.kind === "deleted") {
            const restoredKind =
              row.name !== row.originalName ? "renamed" : "existing";
            return { ...row, kind: restoredKind };
          }
          return { ...row, kind: "deleted" };
        }),
    );
  }, []);

  const restoreRow = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const restoredKind =
          row.name !== row.originalName ? "renamed" : "existing";
        return { ...row, kind: restoredKind };
      }),
    );
  }, []);

  const renameRow = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;

      setRows((prev) => {
        const isDuplicate = prev.some(
          (r) =>
            r.id !== id &&
            r.kind !== "deleted" &&
            r.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (isDuplicate) {
          onError?.(
            t(
              "attachments.duplicateName",
              "An attachment named '{{name}}' already exists.",
              {
                name: trimmed,
              },
            ),
          );
          return prev;
        }

        return prev.map((row) => {
          if (row.id !== id) return row;
          if (row.kind === "staged") {
            return {
              ...row,
              name: trimmed,
              file: rebuildStagedFile(row.file, trimmed),
            };
          }
          const newKind = trimmed === row.originalName ? "existing" : "renamed";
          return { ...row, name: trimmed, kind: newKind };
        });
      });
    },
    [onError, t],
  );

  const startPinPlacement = useCallback((id: string) => {
    setPlacingPinId((prev) => (prev === id ? null : id));
  }, []);

  const cancelPinPlacement = useCallback(() => {
    setPlacingPinId(null);
  }, []);

  const placePin = useCallback(
    (pageIndex: number, x: number, y: number) => {
      const target = rows.find((row) => row.id === placingPinId);
      if (!target) {
        setPlacingPinId(null);
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.id === target.id ? { ...row, pin: { pageIndex, x, y } } : row,
        ),
      );
      setPinRemovalRowIds((prev) => prev.filter((id) => id !== target.id));
      setPinDirty(true);
      setPlacingPinId(null);
    },
    [placingPinId, rows],
  );

  /** Remove a pin; existing attachments queue a server-side removal. */
  const clearPin = useCallback(
    (id: string) => {
      const target = rows.find((row) => row.id === id);
      if (!target?.pin) {
        return;
      }
      if (target.kind !== "staged") {
        setPinRemovalRowIds((prev) =>
          prev.includes(id) ? prev : [...prev, id],
        );
      }
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, pin: undefined } : row)),
      );
      setPinDirty(true);
    },
    [rows],
  );

  const extractAllZip = useCallback(async () => {
    if (!activeFile) return;
    setActiveAction("extractAll");
    try {
      const zipBlob = await apiExtractAttachments(activeFile);
      const baseName = activeFile.name.replace(/\.[^/.]+$/, "");
      const zipFilename = `${baseName}_attachments.zip`;
      await downloadFileWithPolicy({ data: zipBlob, filename: zipFilename });
    } catch (err) {
      const msg = await parseBlobError(err, "Failed to extract attachments.");
      onError?.(msg);
    } finally {
      setActiveAction(null);
    }
  }, [activeFile, onError]);

  const extractSingle = useCallback(
    async (filename: string) => {
      if (!activeFile || !filename) return;
      setActiveAction(`extract-${filename}`);
      try {
        const fileBlob = await apiExtractSingleAttachment(activeFile, filename);
        await downloadFileWithPolicy({ data: fileBlob, filename });
      } catch (err) {
        const msg = await parseBlobError(err, "Failed to download attachment.");
        onError?.(msg);
      } finally {
        setActiveAction(null);
      }
    },
    [activeFile, onError],
  );

  const pendingChangesCount = useMemo(() => {
    const rowChanges = rows.filter((r) => r.kind !== "existing").length;
    // A pin placed on a staged or renamed row is part of that row's change;
    // only a pin edit on an otherwise untouched row adds another count.
    const pinChange =
      pinDirty &&
      (pinRemovalRowIds.length > 0 ||
        rows.some((r) => r.kind === "existing" && r.pin))
        ? 1
        : 0;
    return rowChanges + pinChange;
  }, [rows, pinDirty, pinRemovalRowIds]);

  const hasChanges = pendingChangesCount > 0;

  const saveDraft = useCallback(
    async (convertToPdfA3b?: boolean): Promise<boolean> => {
      if (!activeFile) return false;
      const saveGen = ++genRef.current;
      setIsSaving(true);
      setActiveAction("save");

      try {
        const renames = rows
          .filter((r) => r.kind === "renamed")
          .map((r) => ({ oldName: r.originalName, newName: r.name }));

        const deletions = rows
          .filter((r) => r.kind === "deleted")
          .map((r) => r.originalName);

        const additions = rows
          .filter((r) => r.kind === "staged" && r.file)
          .map((r) => r.file as File);

        const pins = rows
          .filter((r) => r.kind !== "deleted" && r.pin)
          .map((r) => ({
            filename: r.name,
            pageIndex: r.pin!.pageIndex,
            x: r.pin!.x,
            y: r.pin!.y,
          }));

        // Resolve at save time: renamed rows use their new name, deleted rows
        // use the name the server still has on disk.
        const pinRemovals = pinRemovalRowIds
          .map((id) => rows.find((row) => row.id === id))
          .filter((row): row is DraftAttachmentRow => row !== undefined)
          .map((row) => (row.kind === "deleted" ? row.originalName : row.name));

        const updatedBlob = await applyBatchAttachmentOps(activeFile, {
          renames,
          deletions,
          additions,
          pins,
          pinRemovals,
          convertToPdfA3b,
        });

        if (saveGen !== genRef.current) return false;

        const updatedFile = createUpdatedFile(updatedBlob, activeFile);

        const newList = await listAttachments(updatedFile);
        if (saveGen !== genRef.current) return false;

        const freshRows: DraftAttachmentRow[] = newList.map((att, idx) => ({
          id: `existing-${att.filename}-${idx}`,
          originalName: att.filename,
          name: att.filename,
          size: att.size,
          contentType: att.contentType,
          kind: "existing",
          pin:
            att.pinPageIndex != null && att.pinX != null && att.pinY != null
              ? {
                  pageIndex: att.pinPageIndex,
                  x: att.pinX,
                  y: att.pinY,
                }
              : undefined,
        }));
        setRows(freshRows);
        setPinRemovalRowIds([]);
        setPinDirty(false);
        setPlacingPinId(null);

        if (onFileUpdated) {
          skipNextFetchRef.current = true;
          onFileUpdated(updatedFile);
        }
        return true;
      } catch (err) {
        if (saveGen !== genRef.current) return false;
        skipNextFetchRef.current = false;
        const msg = await parseBlobError(
          err,
          "Failed to save attachment changes.",
        );
        onError?.(msg);
        return false;
      } finally {
        if (saveGen === genRef.current) {
          setIsSaving(false);
          setActiveAction(null);
        }
      }
    },
    [activeFile, rows, pinRemovalRowIds, onFileUpdated, onError],
  );

  const discardDraft = useCallback(() => {
    fetchAttachmentsForFile(activeFileRef.current);
  }, [fetchAttachmentsForFile]);

  return {
    rows,
    hasChanges,
    pendingChangesCount,
    isLoading,
    isSaving,
    activeAction,
    placingPinId,
    stageFiles,
    toggleDeleteRow,
    restoreRow,
    renameRow,
    extractAllZip,
    extractSingle,
    startPinPlacement,
    cancelPinPlacement,
    placePin,
    clearPin,
    saveDraft,
    discardDraft,
  };
}

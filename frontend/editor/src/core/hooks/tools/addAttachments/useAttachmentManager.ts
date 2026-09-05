import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  listAttachments,
  applyBatchAttachmentOps,
  extractAttachments as apiExtractAttachments,
  extractSingleAttachment as apiExtractSingleAttachment,
  parseBlobError,
} from "@app/services/attachmentService";
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";

export type DraftRowKind = "existing" | "staged" | "renamed" | "deleted";

export interface DraftAttachmentRow {
  id: string;
  originalName: string;
  name: string;
  size?: number;
  contentType?: string;
  kind: DraftRowKind;
  file?: File;
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

export function useAttachmentManager({
  activeFile,
  onFileUpdated,
  onError,
}: UseAttachmentManagerOptions) {
  const [rows, setRows] = useState<DraftAttachmentRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

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
      }));
      setRows(initialRows);
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

  // Stage new files for addition
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
            onError?.(`Attachment with name '${file.name}' already exists.`);
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
          });
        }
        return [...prev, ...validNewRows];
      });
    },
    [onError],
  );

  // Remove a staged file or toggle deletion on an existing file
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

  // Restore a deleted row
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

  // Rename a row in draft state
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
          onError?.(`An attachment named '${trimmed}' already exists.`);
          return prev;
        }

        return prev.map((row) => {
          if (row.id !== id) return row;
          if (row.kind === "staged") {
            return { ...row, name: trimmed };
          }
          const newKind = trimmed === row.originalName ? "existing" : "renamed";
          return { ...row, name: trimmed, kind: newKind };
        });
      });
    },
    [onError],
  );

  // Extract all attachments into a ZIP
  const extractAllZip = useCallback(async () => {
    if (!activeFile) return;
    setIsDownloading(true);
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
      setIsDownloading(false);
      setActiveAction(null);
    }
  }, [activeFile, onError]);

  // Extract single attachment
  const extractSingle = useCallback(
    async (filename: string) => {
      if (!activeFile || !filename) return;
      setIsDownloading(true);
      setActiveAction(`extract-${filename}`);
      try {
        const fileBlob = await apiExtractSingleAttachment(activeFile, filename);
        await downloadFileWithPolicy({ data: fileBlob, filename });
      } catch (err) {
        const msg = await parseBlobError(err, "Failed to download attachment.");
        onError?.(msg);
      } finally {
        setIsDownloading(false);
        setActiveAction(null);
      }
    },
    [activeFile, onError],
  );

  // Computed draft stats
  const pendingChangesCount = useMemo(() => {
    return rows.filter((r) => r.kind !== "existing").length;
  }, [rows]);

  const hasChanges = pendingChangesCount > 0;

  // Save all draft changes in one single pass
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

        const updatedBlob = await applyBatchAttachmentOps(activeFile, {
          renames,
          deletions,
          additions,
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
        }));
        setRows(freshRows);

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
    [activeFile, rows, onFileUpdated, onError],
  );

  // Discard local draft changes and revert to original server list
  const discardDraft = useCallback(() => {
    fetchAttachmentsForFile(activeFileRef.current);
  }, [fetchAttachmentsForFile]);

  return {
    rows,
    hasChanges,
    pendingChangesCount,
    isLoading,
    isSaving,
    isDownloading,
    activeAction,
    stageFiles,
    toggleDeleteRow,
    restoreRow,
    renameRow,
    extractAllZip,
    extractSingle,
    saveDraft,
    discardDraft,
  };
}

import { useCallback, useRef, useState } from "react";
import { useFileActions, useFileState } from "@app/contexts/FileContext";
import {
  createChildStub,
  generateProcessedFileMetadata,
} from "@app/contexts/file/fileActions";
import { createStirlingFile, StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/file";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";
import { pdfExportService } from "@app/services/pdfExportService";
import { TrackPage, TrackWorkspace } from "@app/components/pageTracks/types";

/**
 * The page editor is a page-level rework of the open documents, which is what
 * the Multi-Tool super tool has always represented in a file's history.
 */
const SAVE_TOOL_ID = "multiTool" as const;

export interface TrackSaveProgress {
  done: number;
  total: number;
}

export interface TrackSaveOptions {
  /**
   * Called per committed file with its old and new ids. Saving replaces a file
   * with a new version under a NEW id, so anything holding the old one (the
   * viewer's active file, for instance) has to be re-pointed.
   */
  onVersioned?: (previousId: FileId, nextId: FileId) => void;
}

export interface TrackSaveHook {
  saving: boolean;
  progress: TrackSaveProgress | null;
  /** Writes every changed track back as a new version of its own file. */
  save: () => Promise<boolean>;
}

interface BuiltTrack {
  fileId: FileId;
  parentStub: StirlingFileStub;
  file: File;
}

/** Shape the export service expects: pages tagged with their source page. */
function toExportDocument(
  name: string,
  ownFile: File,
  pages: TrackPage[],
): PDFDocument {
  const exportPages: PDFPage[] = pages.map((page, index) => ({
    id: page.id,
    pageNumber: index + 1,
    originalPageNumber: page.sourcePageNumber,
    originalFileId: page.sourceFileId,
    rotation: page.rotation,
    thumbnail: null,
    selected: false,
  }));

  return {
    id: `page-tracks-${name}`,
    name,
    file: ownFile,
    pages: exportPages,
    totalPages: exportPages.length,
  };
}

export function useTrackSave(
  workspace: TrackWorkspace,
  changedFileIds: FileId[],
  options: TrackSaveOptions = {},
): TrackSaveHook {
  const { selectors } = useFileState();
  const { actions } = useFileActions();
  const onVersionedRef = useRef(options.onVersioned);
  onVersionedRef.current = options.onVersioned;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<TrackSaveProgress | null>(null);

  const save = useCallback(async () => {
    if (saving || changedFileIds.length === 0) return false;

    const emptied = changedFileIds.filter(
      (fileId) => (workspace.tracks[fileId]?.pages.length ?? 0) === 0,
    );
    const rebuilt = changedFileIds.filter(
      (fileId) => !emptied.includes(fileId),
    );

    setSaving(true);
    setProgress({ done: 0, total: rebuilt.length });

    try {
      // Build every output first: a track can hold pages belonging to another
      // track's file, and committing as we go would swap those bytes out from
      // under a later build.
      const built: BuiltTrack[] = [];
      for (const fileId of rebuilt) {
        const pages = workspace.tracks[fileId]?.pages ?? [];
        const parentStub = selectors.getStirlingFileStub(fileId);
        const ownFile = selectors.getFile(fileId);
        if (!parentStub || !ownFile) continue;

        const sourceFiles = new Map<string, File>();
        for (const page of pages) {
          if (sourceFiles.has(page.sourceFileId)) continue;
          const sourceFile = selectors.getFile(page.sourceFileId);
          if (sourceFile) sourceFiles.set(page.sourceFileId, sourceFile);
        }

        const { blob } = await pdfExportService.exportPDFMultiFile(
          toExportDocument(parentStub.name, ownFile, pages),
          sourceFiles,
          [],
          { filename: parentStub.name },
        );

        built.push({
          fileId,
          parentStub,
          file: new File([blob], parentStub.name, {
            type: "application/pdf",
          }),
        });
        setProgress({ done: built.length, total: rebuilt.length });
      }

      // Commit one file at a time so each new version lands in its own track's
      // slot instead of the whole batch clumping at the top of the file list.
      for (const entry of built) {
        const processedFile = await generateProcessedFileMetadata(entry.file);
        const outputStub = createChildStub(
          entry.parentStub,
          { toolId: SAVE_TOOL_ID, timestamp: Date.now() },
          entry.file,
          processedFile?.thumbnailUrl,
          processedFile,
        );
        await actions.consumeFiles(
          [entry.fileId],
          [createStirlingFile(entry.file, outputStub.id)],
          [outputStub],
          { silent: true },
        );
        onVersionedRef.current?.(entry.fileId, outputStub.id);
      }

      if (emptied.length > 0) {
        // Every page moved out, so there is nothing left to version. Drop the
        // file from the workbench but keep it in storage at its last version.
        await actions.removeFiles(emptied, false);
      }

      return true;
    } catch (error) {
      console.error("[PageTracks] save failed", error);
      return false;
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }, [actions, changedFileIds, saving, selectors, workspace]);

  return { saving, progress, save };
}

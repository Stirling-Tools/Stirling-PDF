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
  /**
   * Called with the split tracks that were just written to their own new files.
   * Those synthetic tracks must be dropped: the newly added files re-enter the
   * workspace as ordinary file-backed tracks.
   */
  onMaterialized?: (splitTrackIds: FileId[]) => void;
}

export interface TrackSaveHook {
  saving: boolean;
  progress: TrackSaveProgress | null;
  /** Writes every changed track back as a new version of its own file. */
  save: () => Promise<boolean>;
}

interface BuiltTrack {
  /** The workspace track id (synthetic for a split). */
  trackId: FileId;
  /** The file to version, or null for a split that becomes a brand-new file. */
  inputFileId: FileId | null;
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
  const onMaterializedRef = useRef(options.onMaterialized);
  onMaterializedRef.current = options.onMaterialized;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<TrackSaveProgress | null>(null);

  const save = useCallback(async () => {
    if (saving || changedFileIds.length === 0) return false;

    // A file-backed track emptied of every page has nothing to version.
    const emptied = changedFileIds.filter((id) => {
      const track = workspace.tracks[id];
      return track != null && !track.isNew && track.pages.length === 0;
    });
    const rebuilt = changedFileIds.filter(
      (id) => (workspace.tracks[id]?.pages.length ?? 0) > 0,
    );

    setSaving(true);
    setProgress({ done: 0, total: rebuilt.length });

    try {
      // Build every output first: a track can hold pages belonging to another
      // track's file, and committing as we go would swap those bytes out from
      // under a later build.
      const built: BuiltTrack[] = [];
      for (const id of rebuilt) {
        const track = workspace.tracks[id];
        if (!track) continue;
        const pages = track.pages;

        // A split has no file of its own: it is written to a new file, parented
        // to (and named after) the document its pages came from.
        const anchorFileId = track.isNew ? pages[0]?.sourceFileId : id;
        if (!anchorFileId) continue;
        const parentStub = selectors.getStirlingFileStub(anchorFileId);
        const ownFile = selectors.getFile(anchorFileId);
        if (!parentStub || !ownFile) continue;
        const name = track.isNew ? track.name : parentStub.name;

        const sourceFiles = new Map<string, File>();
        for (const page of pages) {
          if (sourceFiles.has(page.sourceFileId)) continue;
          const sourceFile = selectors.getFile(page.sourceFileId);
          if (sourceFile) sourceFiles.set(page.sourceFileId, sourceFile);
        }

        const { blob } = await pdfExportService.exportPDFMultiFile(
          toExportDocument(name, ownFile, pages),
          sourceFiles,
          [],
          { filename: name },
        );

        built.push({
          trackId: id,
          inputFileId: track.isNew ? null : id,
          parentStub,
          file: new File([blob], name, { type: "application/pdf" }),
        });
        setProgress({ done: built.length, total: rebuilt.length });
      }

      // Version each file-backed track in place (a new version of its own
      // file). One at a time so each lands in its own slot rather than clumping
      // at the top of the file list.
      for (const entry of built) {
        if (entry.inputFileId == null) continue;
        const processedFile = await generateProcessedFileMetadata(entry.file);
        const outputStub = createChildStub(
          entry.parentStub,
          { toolId: SAVE_TOOL_ID, timestamp: Date.now() },
          entry.file,
          processedFile?.thumbnailUrl,
          processedFile,
        );
        await actions.consumeFiles(
          [entry.inputFileId],
          [createStirlingFile(entry.file, outputStub.id)],
          [outputStub],
          { silent: true },
        );
        onVersionedRef.current?.(entry.inputFileId, outputStub.id);
      }

      // A split becomes a brand-new active file, exactly like the Multi-Tool's
      // apply: add the fresh files so they enter the workbench (and the
      // workspace, via sync) as their own tracks.
      const splitFiles = built
        .filter((entry) => entry.inputFileId == null)
        .map((entry) => entry.file);
      if (splitFiles.length > 0) {
        await actions.addFiles(splitFiles, {
          selectFiles: false,
          skipUploadTracking: true,
        });
      }

      if (emptied.length > 0) {
        // Every page moved out, so there is nothing left to version. Drop the
        // file from the workbench but keep it in storage at its last version.
        await actions.removeFiles(emptied, false);
      }

      // The split tracks now live in their own files; drop the synthetic tracks
      // so the added files take their place as ordinary file-backed tracks.
      const materialized = built
        .filter((entry) => entry.inputFileId == null)
        .map((entry) => entry.trackId);
      if (materialized.length > 0) onMaterializedRef.current?.(materialized);

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

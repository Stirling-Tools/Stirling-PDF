import { StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/file";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";
import { pdfExportService } from "@app/services/pdfExportService";
import { policySourceIds } from "@app/services/policyFileGuard";
import {
  Track,
  TrackPage,
  TrackWorkspace,
  isSourcePage,
} from "@app/components/pageTracks/types";

export interface TrackFileLookup {
  getStub: (id: FileId) => StirlingFileStub | undefined;
  getFile: (id: FileId) => File | undefined;
}

export interface BuiltTrackFile {
  file: File;
  /** The file the output descends from: the track's own, or a split's source. */
  parentStub: StirlingFileStub;
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
    rotation: page.rotation,
    thumbnail: null,
    selected: false,
    ...(isSourcePage(page)
      ? {
          originalPageNumber: page.sourcePageNumber,
          originalFileId: page.sourceFileId,
        }
      : {
          originalPageNumber: -1,
          isBlankPage: true,
          blankSize: { width: page.width, height: page.height },
        }),
  }));

  return {
    id: `page-tracks-${name}`,
    name,
    file: ownFile,
    pages: exportPages,
    totalPages: exportPages.length,
  };
}

/**
 * Renders a track's pages, as the editor shows them, into a PDF. A split has no
 * file of its own, so it is named after its track and parented to the file its
 * first source page came from, else the file it was cut from. Null when there
 * are no pages or that file has closed.
 */
export async function buildTrackFile(
  track: Track,
  lookup: TrackFileLookup,
): Promise<BuiltTrackFile | null> {
  const { pages } = track;
  const sourcePages = pages.filter(isSourcePage);
  const anchorFileId = track.isNew
    ? (sourcePages[0]?.sourceFileId ?? track.splitFromFileId)
    : track.fileId;
  if (!anchorFileId) return null;
  const parentStub = lookup.getStub(anchorFileId);
  const ownFile = lookup.getFile(anchorFileId);
  if (!parentStub || !ownFile) return null;
  const name = track.isNew ? track.name : parentStub.name;

  const sourceFiles = new Map<string, File>();
  for (const page of sourcePages) {
    if (sourceFiles.has(page.sourceFileId)) continue;
    const sourceFile = lookup.getFile(page.sourceFileId);
    if (sourceFile) sourceFiles.set(page.sourceFileId, sourceFile);
  }

  const { blob } = await pdfExportService.exportPDFMultiFile(
    toExportDocument(name, ownFile, pages),
    sourceFiles,
    [],
    { filename: name },
  );
  return {
    file: new File([blob], name, { type: "application/pdf" }),
    parentStub,
  };
}

/** Every file whose bytes building these tracks writes out, including consumed ancestors. */
export function policyIdsForTracks(
  workspace: TrackWorkspace,
  trackIds: FileId[],
  getStub: TrackFileLookup["getStub"],
): string[] {
  const fileIds = new Set<FileId>();
  for (const id of trackIds) {
    const track = workspace.tracks[id];
    if (!track) continue;
    if (!track.isNew) fileIds.add(id);
    track.pages
      .filter(isSourcePage)
      .forEach((page) => fileIds.add(page.sourceFileId));
  }
  return [...fileIds].flatMap((id) => {
    const stub = getStub(id);
    return stub ? policySourceIds(stub) : [id];
  });
}

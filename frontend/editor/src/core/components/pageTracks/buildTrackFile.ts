import { StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/file";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";
import { pdfExportService } from "@app/services/pdfExportService";
import { policySourceIds } from "@app/services/policyFileGuard";
import {
  asPdfSource,
  toPdfName,
} from "@app/components/pageTracks/trackFileKind";
import {
  Track,
  TrackPage,
  TrackWorkspace,
  allPages,
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
 * are no pages or that file has closed. The output is always a PDF, so a track
 * that was an image is renamed to match.
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
  const name = toPdfName(track.isNew ? track.name : parentStub.name);

  const sourceFiles = new Map<string, File>();
  for (const page of sourcePages) {
    if (sourceFiles.has(page.sourceFileId)) continue;
    const sourceFile = lookup.getFile(page.sourceFileId);
    if (sourceFile)
      sourceFiles.set(page.sourceFileId, await asPdfSource(sourceFile));
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
  return policyIdsForFiles(fileIds, getStub);
}

/** Every file whose bytes the selected pages copy, including consumed ancestors. */
export function policyIdsForPages(
  workspace: TrackWorkspace,
  pageIds: ReadonlySet<string>,
  getStub: TrackFileLookup["getStub"],
): string[] {
  const fileIds = new Set<FileId>();
  for (const page of allPages(workspace)) {
    if (pageIds.has(page.id) && isSourcePage(page)) {
      fileIds.add(page.sourceFileId);
    }
  }
  return policyIdsForFiles(fileIds, getStub);
}

function policyIdsForFiles(
  fileIds: Set<FileId>,
  getStub: TrackFileLookup["getStub"],
): string[] {
  return [...fileIds].flatMap((id) => {
    const stub = getStub(id);
    return stub ? policySourceIds(stub) : [id];
  });
}

/** How a download of the selected pages is split into files. */
export type SelectedPagesLayout = "eachPage" | "oneFile";

interface SelectedPage {
  track: Track;
  page: TrackPage;
  /** 1-based position in its track, as the editor numbers it. */
  pageNumber: number;
}

function selectedPagesInOrder(
  workspace: TrackWorkspace,
  selectedIds: ReadonlySet<string>,
): SelectedPage[] {
  return workspace.order.flatMap((trackId) => {
    const track = workspace.tracks[trackId];
    if (!track) return [];
    return track.pages.flatMap((page, index) =>
      selectedIds.has(page.id) ? [{ track, page, pageNumber: index + 1 }] : [],
    );
  });
}

const baseName = (track: Track): string => track.name.replace(/\.pdf$/i, "");

/** Built as a split so it takes `name`, and blank pages alone still have the
 *  file of the track they sit in to parent to. */
function buildPagesFile(
  pages: TrackPage[],
  name: string,
  track: Track,
  lookup: TrackFileLookup,
): Promise<BuiltTrackFile | null> {
  return buildTrackFile(
    {
      fileId: track.fileId,
      name,
      isNew: true,
      splitFromFileId: track.isNew ? track.splitFromFileId : track.fileId,
      pages,
    },
    lookup,
  );
}

/**
 * Renders the selected pages, as the editor shows them and in workspace order,
 * without saving anything: one PDF per page named after its track and page
 * number, or one PDF of them all named after the first page's track. Pages
 * whose file has closed are skipped.
 */
export async function buildSelectedPagesFiles(
  workspace: TrackWorkspace,
  selectedIds: ReadonlySet<string>,
  layout: SelectedPagesLayout,
  lookup: TrackFileLookup,
): Promise<BuiltTrackFile[]> {
  const selected = selectedPagesInOrder(workspace, selectedIds);
  const first = selected[0];
  if (!first) return [];

  if (layout === "oneFile") {
    const output = await buildPagesFile(
      selected.map(({ page }) => page),
      `${baseName(first.track)} (selected pages).pdf`,
      first.track,
      lookup,
    );
    return output ? [output] : [];
  }

  const built: BuiltTrackFile[] = [];
  for (const { track, page, pageNumber } of selected) {
    const output = await buildPagesFile(
      [page],
      `${baseName(track)} (page ${pageNumber}).pdf`,
      track,
      lookup,
    );
    if (output) built.push(output);
  }
  return built;
}

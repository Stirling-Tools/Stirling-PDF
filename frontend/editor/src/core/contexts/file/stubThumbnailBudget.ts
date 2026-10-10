import type { FileId } from "@app/types/file";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";

// Long tool sessions accumulate one stub per file and variant, each carrying
// full-page data-URL thumbnails (~1.5MB each, rotated + unrotated). The display
// chain refills a stripped thumbnailUrl on demand from IndexedDB bytes, so
// cold stubs can drop theirs once the session holds this much.
export const MAX_RETAINED_STUB_THUMBNAIL_BYTES = 64 * 1024 * 1024;

const isHeavyThumbnail = (value: string | undefined): boolean =>
  !!value && value.startsWith("data:");

function stubThumbnailBytes(stub: StirlingFileStub): number {
  let bytes = 0;
  if (isHeavyThumbnail(stub.thumbnailUrl)) {
    bytes += stub.thumbnailUrl!.length;
  }
  const processedFile = stub.processedFile;
  // The nested thumbnailUrl is a second full-page data URL (rotated variant),
  // distinct from the stub-level one and the per-page thumbs below.
  if (isHeavyThumbnail(processedFile?.thumbnailUrl)) {
    bytes += processedFile!.thumbnailUrl!.length;
  }
  const pages = processedFile?.pages;
  if (pages) {
    for (const page of pages) {
      if (isHeavyThumbnail(page.thumbnail)) {
        bytes += page.thumbnail!.length;
      }
    }
  }
  return bytes;
}

/**
 * Oldest-first ids whose data-URL thumbnails must go to fit the byte budget.
 * Pinned, selected and just-hydrated files are never candidates: stripping the
 * file that triggered enforcement would ping-pong with its on-demand refill.
 */
export function selectThumbnailEvictionIds(
  state: FileContextState,
  exemptId?: FileId,
  capBytes: number = MAX_RETAINED_STUB_THUMBNAIL_BYTES,
): FileId[] {
  let total = 0;
  for (const id of state.files.ids) {
    total += stubThumbnailBytes(state.files.byId[id]);
  }
  if (total <= capBytes) {
    return [];
  }
  const evict: FileId[] = [];
  for (const id of state.files.ids) {
    if (total <= capBytes) {
      break;
    }
    if (
      id === exemptId ||
      state.pinnedFiles.has(id) ||
      state.ui.selectedFileIds.includes(id)
    ) {
      continue;
    }
    const freed = stubThumbnailBytes(state.files.byId[id]);
    if (freed > 0) {
      evict.push(id);
      total -= freed;
    }
  }
  return evict;
}

/**
 * Drop the data-URL thumbnails a stub retains, leaving every other field intact.
 * Applied to the record inside the reducer so a queued update cannot be
 * overwritten by a stale stub snapshot captured before it landed.
 */
export function clearStubThumbnails(stub: StirlingFileStub): StirlingFileStub {
  const processedFile = stub.processedFile;
  return {
    ...stub,
    thumbnailUrl: undefined,
    processedFile: processedFile
      ? {
          ...processedFile,
          thumbnailUrl: undefined,
          pages: processedFile.pages.map((page) =>
            isHeavyThumbnail(page.thumbnail)
              ? { ...page, thumbnail: undefined }
              : page,
          ),
        }
      : processedFile,
  };
}

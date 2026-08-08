/**
 * Shared Storybook scaffolding for the file manager.
 *
 * Every component under this directory reads FileManagerContext, whose context
 * object is private — only the provider and its hook are exported — so stories
 * cannot hand it a slice and must mount the real provider. That provider in
 * turn calls into FileContext (file actions, file management), which itself
 * needs IndexedDBContext, and several of the components branch on the app
 * config. None of those are part of the shared preview decorators, so the whole
 * stack is stood up here once rather than repeated in each story file.
 *
 * The data is static: no bytes are written to IndexedDB, so anything that would
 * read file contents (thumbnail generation, downloads) simply does nothing.
 */
import type { ReactElement } from "react";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { FileContextProvider } from "@app/contexts/FileContext";
import { FileManagerProvider } from "@app/contexts/FileManagerContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * A minimally complete file stub. `thumbnailUrl` is always set so the thumbnail
 * hooks short-circuit on it instead of trying to read bytes out of IndexedDB.
 */
export function makeStub(
  id: string,
  name: string,
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  return {
    id: id as FileId,
    name,
    type: "application/pdf",
    size: 2_400_000,
    lastModified: Date.UTC(2026, 0, 14),
    createdAt: Date.UTC(2026, 0, 14),
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    thumbnailUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='160'%3E%3Crect width='120' height='160' fill='%23e9ecef'/%3E%3C/svg%3E",
    ...overrides,
  };
}

interface FileManagerHarnessOptions {
  /** Files offered in the "recent" source. Empty renders the empty states. */
  recentFiles?: StirlingFileStub[];
  /** Seeds the provider's initial selection, which drives the bulk actions. */
  activeFileIds?: FileId[];
  isLoading?: boolean;
  /** Merged over the defaults; the storage flags gate whole controls. */
  config?: Record<string, unknown>;
}

/** Everything off — the plain local-only build most stories want. */
const BASE_CONFIG = {
  storageEnabled: false,
  storageSharingEnabled: false,
  storageShareLinksEnabled: false,
  enableMobileScanner: false,
};

export function withFileManager({
  recentFiles = [],
  activeFileIds = [],
  isLoading = false,
  config = {},
}: FileManagerHarnessOptions = {}) {
  return (Story: () => ReactElement) => (
    <AppConfigProvider
      initialConfig={{ ...BASE_CONFIG, ...config } as never}
      bootstrapMode="non-blocking"
      autoFetch={false}
    >
      <FileContextProvider>
        <FileManagerProvider
          recentFiles={recentFiles}
          onRecentFilesSelected={() => {}}
          onNewFilesSelect={() => {}}
          onClose={() => {}}
          isFileSupported={() => true}
          isOpen
          onFileRemove={() => {}}
          modalHeight="600px"
          refreshRecentFiles={async () => {}}
          isLoading={isLoading}
          activeFileIds={activeFileIds}
        >
          <Story />
        </FileManagerProvider>
      </FileContextProvider>
    </AppConfigProvider>
  );
}

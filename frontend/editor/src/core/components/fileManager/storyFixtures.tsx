/**
 * Shared fixtures for the file manager stories.
 *
 * These components sit deep in a provider chain — FileManagerContext needs
 * FileContext for useFileActions/useFileManagement, list rows additionally read
 * AppConfig — and none of it is part of the shared preview decorators. Rather
 * than each story rebuilding that tree, they mount the real providers here over
 * static data, so what a story exercises is the component and not a stub.
 */
import type { ReactElement } from "react";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { FileContextProvider } from "@app/contexts/FileContext";
import { FileManagerProvider } from "@app/contexts/FileManagerContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/** A grey rectangle, so thumbnail lookups short-circuit instead of reading
 *  file bytes out of IndexedDB. */
const THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='160'%3E%3Crect width='120' height='160' fill='%23e9ecef'/%3E%3C/svg%3E";

/** Fixed so stories render identically on every run. */
const LAST_MODIFIED = Date.parse("2026-03-14T09:30:00Z");

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
    lastModified: LAST_MODIFIED,
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    thumbnailUrl: THUMBNAIL,
    ...overrides,
  };
}

export const mockFile = makeStub("story-file-1", "quarterly-report.pdf");

/** Storage off keeps the row's upload and share affordances out of the way;
 *  stories that want them pass their own config. */
const BASE_CONFIG = {
  storageEnabled: false,
  storageSharingEnabled: false,
  storageShareLinksEnabled: false,
  frontendUrl: "https://stirling.example",
};

interface FixtureOptions {
  recentFiles?: StirlingFileStub[];
  activeFileIds?: FileId[];
  isLoading?: boolean;
  /** Any AppConfig field, not just the few defaulted below — stories reach for
   *  Drive and tool-visibility flags too. */
  config?: Record<string, unknown>;
}

export function withFileManager({
  recentFiles = [mockFile],
  activeFileIds = [],
  isLoading = false,
  config,
}: FixtureOptions = {}) {
  return (Story: () => ReactElement) => (
    <AppConfigProvider
      initialConfig={{ ...BASE_CONFIG, ...config } as never}
      bootstrapMode="non-blocking"
      autoFetch={false}
    >
      {/* The empty state's wordmark resolves a logo variant through
          PreferencesContext, which the preview does not mount. */}
      <PreferencesProvider>
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
      </PreferencesProvider>
    </AppConfigProvider>
  );
}

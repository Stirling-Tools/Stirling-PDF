import type { ComponentProps } from "react";
import type { Decorator } from "@storybook/react-vite";
import { FilesModalContext } from "@editor/contexts/FilesModalContext";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { ViewerStoryProviders } from "@editor/components/viewer/viewerStoryProviders";
import { fileStorage } from "@editor/services/fileStorage";
import {
  createNewStirlingFileStub,
  createStirlingFile,
  type StirlingFile,
  type StirlingFileStub,
} from "@editor/types/fileContext";

type FilesModalValue = ComponentProps<
  typeof FilesModalContext.Provider
>["value"];

const noop = () => {};

// The real provider ingests files and switches the workbench view, which
// pulls in navigation and tool state a story has no use for.
const filesModalStub: FilesModalValue = {
  isFilesModalOpen: false,
  openFilesModal: noop,
  closeFilesModal: noop,
  maxSelectable: null,
  onFileUpload: async () => {},
  onRecentFileSelect: async () => {},
  loadFiles: async () => [],
  setOnModalClose: noop,
};

/** Set as `parameters.fileSources` on a story or its meta. */
export interface FileSourcesStoryParameters {
  /** Offers the phone source, which the server config turns on. */
  mobileScanner?: boolean;
  /** Width of the column the story renders in; the tool panel is narrow. */
  width?: string;
}

/**
 * Provides what the file sources read that the preview decorators lack: the
 * workbench, recents and selected tool (the viewer story providers) and the
 * files modal. The preview's config is re-provided only to vary the phone
 * source.
 */
export const withFileSources: Decorator = (Story, context) => {
  const { mobileScanner = false, width = "18rem" } = (context.parameters
    .fileSources ?? {}) as FileSourcesStoryParameters;
  return (
    <AppConfigProvider
      initialConfig={{ enableMobileScanner: mobileScanner }}
      autoFetch={false}
    >
      <ViewerStoryProviders>
        <FilesModalContext.Provider value={filesModalStub}>
          <div style={{ width }}>
            <Story />
          </div>
        </FilesModalContext.Provider>
      </ViewerStoryProviders>
    </AppConfigProvider>
  );
};

function storyPdf(name: string): File {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

export function storyFile(name: string): StirlingFile {
  return createStirlingFile(storyPdf(name));
}

export function storyFileStub(name: string): StirlingFileStub {
  return createNewStirlingFileStub(storyPdf(name));
}

/**
 * Empties stored files, so recents start empty whatever an earlier story or
 * an interrupted run left behind. Use as a story's `beforeEach`.
 */
export async function clearRecentFiles(): Promise<void> {
  await fileStorage.clearAll();
}

/**
 * Puts one file in recents, so the library source shows, and returns the
 * cleanup that removes it. Use as a story's `beforeEach`.
 */
export async function seedRecentFile(): Promise<() => Promise<void>> {
  await clearRecentFiles();
  const file = storyPdf("recent.pdf");
  const stub = createNewStirlingFileStub(file);
  await fileStorage.storeStirlingFile(createStirlingFile(file, stub.id), stub);
  return () => fileStorage.deleteStirlingFile(stub.id);
}

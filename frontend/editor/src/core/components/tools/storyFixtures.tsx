/**
 * Shared context slices for the tool-panel stories.
 *
 * These components sit under providers that reach most of the app — the tool
 * workflow stands up the registry and navigation, the workbench bar derives its
 * buttons from the whole workbench. Each component here reads only a handful of
 * fields, so the slices below supply those instead. What a story mounts is then
 * an honest record of what its component actually depends on.
 */
import type { ReactElement } from "react";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { FileContextProvider } from "@app/contexts/FileContext";
import {
  NavigationStateContext,
  type NavigationContextStateValue,
} from "@app/contexts/NavigationContext";
import {
  ToolWorkflowContext,
  ToolWorkflowDataContext,
  ToolWorkflowActionsContext,
  type ToolWorkflowContextValue,
  type ToolWorkflowDataValue,
  type ToolWorkflowActionsValue,
} from "@app/contexts/ToolWorkflowContext";
import {
  HotkeyContext,
  type HotkeyContextValue,
} from "@app/contexts/HotkeyContext";
import {
  FilesModalContext,
  type FilesModalContextType,
} from "@app/contexts/FilesModalContext";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";

export interface ToolContextOptions {
  /** Which workbench is active; several components render only in one. */
  workbench?: string;
  /** Favourited tool ids, for anything drawing a star. */
  favourites?: string[];
  /** Index the viewer is showing, for scope-aware copy. */
  activeFileIndex?: number;
  /** Extra viewer fields for components that reach further into it. */
  viewer?: Partial<Record<string, unknown>>;
}

export function withToolContexts({
  workbench = "viewer",
  favourites = [],
  activeFileIndex = 0,
  viewer = {},
}: ToolContextOptions = {}) {
  return (Story: () => ReactElement): ReactElement => (
    <AppConfigProvider
      initialConfig={{ premiumEnabled: true } as never}
      bootstrapMode="non-blocking"
      autoFetch={false}
    >
      <HotkeyContext.Provider value={{ hotkeys: {} } as HotkeyContextValue}>
        <NavigationStateContext.Provider
          value={{ workbench } as unknown as NavigationContextStateValue}
        >
          <ToolWorkflowContext.Provider
            value={
              {
                getSelectedTool: () => null,
                toolPanelMode: "normal",
                leftPanelView: "tools",
                readerMode: false,
              } as unknown as ToolWorkflowContextValue
            }
          >
            <ToolWorkflowDataContext.Provider
              value={
                {
                  isFavorite: (id: string) => favourites.includes(id),
                  toolAvailability: {},
                  toolRegistry: {},
                  favoriteTools: favourites,
                } as unknown as ToolWorkflowDataValue
              }
            >
              <ToolWorkflowActionsContext.Provider
                value={
                  {
                    toggleFavorite: () => {},
                    handleToolSelect: () => {},
                  } as unknown as ToolWorkflowActionsValue
                }
              >
                <ViewerContext.Provider
                  value={
                    {
                      activeFileIndex,
                      ...viewer,
                    } as unknown as ViewerContextType
                  }
                >
                  <FilesModalContext.Provider
                    value={
                      {
                        openFilesModal: () => {},
                        onFileUpload: () => {},
                      } as unknown as FilesModalContextType
                    }
                  >
                    {/* Real FileContext: the file list drives scope-aware copy,
                        and it stands up standalone with no files. */}
                    <FileContextProvider>
                      <Story />
                    </FileContextProvider>
                  </FilesModalContext.Provider>
                </ViewerContext.Provider>
              </ToolWorkflowActionsContext.Provider>
            </ToolWorkflowDataContext.Provider>
          </ToolWorkflowContext.Provider>
        </NavigationStateContext.Provider>
      </HotkeyContext.Provider>
    </AppConfigProvider>
  );
}

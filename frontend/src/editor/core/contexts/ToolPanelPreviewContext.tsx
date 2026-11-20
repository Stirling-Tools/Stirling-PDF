import { createContext, useContext, type ReactNode } from "react";

/**
 * Lets a host outside the editor draw every part of a tool panel at once: steps
 * that would wait for a file or a choice open anyway, and tool parameters start
 * from values the panel's own inputs would only reach after user input (a
 * certificate file, a stamp image). The editor never provides it, so the defaults
 * leave every tool behaving exactly as it ships.
 */
export interface ToolPanelPreview {
  expandAllSteps: boolean;
  /** Merged over each tool parameter hook's defaults when the hook first mounts. */
  parameters?: Readonly<Record<string, unknown>>;
}

const EDITOR_DEFAULT: ToolPanelPreview = { expandAllSteps: false };

const ToolPanelPreviewContext = createContext<ToolPanelPreview>(EDITOR_DEFAULT);

export function ToolPanelPreviewProvider({
  value,
  children,
}: {
  value: ToolPanelPreview;
  children: ReactNode;
}) {
  return (
    <ToolPanelPreviewContext.Provider value={value}>
      {children}
    </ToolPanelPreviewContext.Provider>
  );
}

export function useToolPanelPreview(): ToolPanelPreview {
  return useContext(ToolPanelPreviewContext);
}

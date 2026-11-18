import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export interface ViewerPageLayerProps {
  pageIndex: number;
  /** CSS size of the viewer's page box, before the page's /Rotate is applied. */
  width: number;
  height: number;
  /**
   * Report whether the layer fully covers the page. Until it does, the viewer's
   * own layers show underneath so the page never goes blank; once it does,
   * the viewer hides its render and drops its other layers.
   */
  onCovered: (covered: boolean) => void;
}

/**
 * A tool that works directly on the viewer's pages, replacing their layers.
 *
 * While one is registered the viewer pauses its own pointer interactions, keeps
 * only its zoom and print shortcuts, and holds the view rotation at zero: the
 * tool's layers are drawn in the page's own orientation.
 */
export interface ViewerPageTool {
  /** Workbench file the tool is working on; pages of any other file stay the viewer's own. */
  fileId: string | null;
  PageLayer: ComponentType<ViewerPageLayerProps>;
  /** Docked above the pages. */
  Toolbar: ComponentType;
  /** Docked below the pages, in place of the viewer's page and zoom bar. */
  BottomBar?: ComponentType;
  /**
   * Drops the tool's unsaved work when the user discards it at the app's
   * unsaved-changes prompt, which then lets the navigation through.
   */
  onDiscard?: () => void;
  /**
   * Saves the tool's work when the user picks Save at the app's unsaved-changes
   * prompt. Rejecting keeps the prompt open.
   */
  onSave?: () => Promise<void>;
  /** Toggles the tool's own find, which the viewer's search button opens in place of its own. */
  onToggleFind?: () => void;
}

/** Text selected in the viewer that a page tool is asked to open at. */
export interface ViewerTextTarget {
  /** Workbench file the text is in. */
  fileId: string;
  pageIndex: number;
  text: string;
  /** Where the text sits on the page, in PDF points from the top-left corner. */
  rect?: { x: number; y: number; width: number; height: number };
}

interface ViewerPageToolSlot {
  tool: ViewerPageTool | null;
  setTool: Dispatch<SetStateAction<ViewerPageTool | null>>;
  /** Held until the tool that opens takes it. */
  textTarget: ViewerTextTarget | null;
  setTextTarget: (target: ViewerTextTarget | null) => void;
}

const ViewerPageToolContext = createContext<ViewerPageToolSlot>({
  tool: null,
  setTool: () => {},
  textTarget: null,
  setTextTarget: () => {},
});

export function ViewerPageToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<ViewerPageTool | null>(null);
  const [textTarget, setTextTarget] = useState<ViewerTextTarget | null>(null);
  const slot = useMemo(
    () => ({ tool, setTool, textTarget, setTextTarget }),
    [tool, textTarget],
  );
  return (
    <ViewerPageToolContext.Provider value={slot}>
      {children}
    </ViewerPageToolContext.Provider>
  );
}

/** The tool currently working on the viewer's pages, or null. */
export function useViewerPageTool(): ViewerPageTool | null {
  return useContext(ViewerPageToolContext).tool;
}

/**
 * Registers `tool` on the viewer's pages for as long as the caller is mounted;
 * null registers nothing. Pass a memoised value: a new object on every render
 * re-registers it.
 */
export function useRegisterViewerPageTool(tool: ViewerPageTool | null): void {
  const { setTool } = useContext(ViewerPageToolContext);
  useEffect(() => {
    if (!tool) return;
    setTool(tool);
    // Only withdraw our own registration: a tool that registered since keeps its slot.
    return () => setTool((current) => (current === tool ? null : current));
  }, [tool, setTool]);
}

/** Asks the next page tool to open at text selected in the viewer. */
export function useSetViewerTextTarget(): (
  target: ViewerTextTarget | null,
) => void {
  return useContext(ViewerPageToolContext).setTextTarget;
}

/** The text a page tool was asked to open at, if any, and how to drop it once taken. */
export function useViewerTextTarget(): {
  textTarget: ViewerTextTarget | null;
  clearTextTarget: () => void;
} {
  const { textTarget, setTextTarget } = useContext(ViewerPageToolContext);
  const clearTextTarget = useCallback(
    () => setTextTarget(null),
    [setTextTarget],
  );
  return { textTarget, clearTextTarget };
}

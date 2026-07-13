import { createContext, useContext, useState, useRef, useMemo } from "react";
import {
  SidebarState,
  SidebarRefs,
  SidebarContextValue,
  SidebarProviderProps,
} from "@app/types/sidebar";

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined,
);

export function SidebarProvider({ children }: SidebarProviderProps) {
  // All sidebar state management
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const toolPanelRef = useRef<HTMLDivElement>(null);

  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<
    "toolPicker" | "toolContent"
  >("toolPicker");
  const [readerMode, setReaderMode] = useState(false);

  const sidebarState: SidebarState = useMemo(
    () => ({
      sidebarsVisible,
      leftPanelView,
      readerMode,
    }),
    [sidebarsVisible, leftPanelView, readerMode],
  );

  const sidebarRefs: SidebarRefs = useMemo(
    () => ({
      quickAccessRef,
      toolPanelRef,
    }),
    [quickAccessRef, toolPanelRef],
  );

  const contextValue: SidebarContextValue = useMemo(
    () => ({
      sidebarState,
      sidebarRefs,
      setSidebarsVisible,
      setLeftPanelView,
      setReaderMode,
    }),
    [
      sidebarState,
      sidebarRefs,
      setSidebarsVisible,
      setLeftPanelView,
      setReaderMode,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebarContext must be used within a SidebarProvider");
  }
  return context;
}

/**
 * Non-throwing variant for shared components that can render outside the
 * provider (e.g. the core Tooltip reused in the Processor portal, which only
 * consumes sidebar state when `sidebarTooltip` is set). Returns undefined
 * instead of throwing.
 */
export function useSidebarContextOptional(): SidebarContextValue | undefined {
  return useContext(SidebarContext);
}

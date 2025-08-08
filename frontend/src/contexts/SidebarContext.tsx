import React, { createContext, useContext, useState, useRef } from 'react';
import { SidebarState, SidebarRefs, SidebarContextValue, SidebarProviderProps } from '../types/sidebar';

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: SidebarProviderProps) {
  // All sidebar state management
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const toolPanelRef = useRef<HTMLDivElement>(null);
  
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<'toolPicker' | 'toolContent'>('toolPicker');
  const [readerMode, setReaderMode] = useState(false);

  const sidebarState: SidebarState = {
    sidebarsVisible,
    leftPanelView,
    readerMode,
  };

  const sidebarRefs: SidebarRefs = {
    quickAccessRef,
    toolPanelRef,
  };

  const contextValue: SidebarContextValue = {
    sidebarState,
    sidebarRefs,
    setSidebarsVisible,
    setLeftPanelView,
    setReaderMode,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebarContext must be used within a SidebarProvider');
  }
  return context;
} 
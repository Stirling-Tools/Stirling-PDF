export interface SidebarState {
  leftPanelView: "toolPicker" | "toolContent";
  readerMode: boolean;
}

export interface SidebarRefs {
  quickAccessRef: React.RefObject<HTMLDivElement | null>;
  toolPanelRef: React.RefObject<HTMLDivElement | null>;
}

export interface SidebarInfo {
  rect: DOMRect | null;
  isToolPanelActive: boolean;
  sidebarState: SidebarState;
}

// Context-related interfaces
export interface SidebarContextValue {
  sidebarState: SidebarState;
  sidebarRefs: SidebarRefs;
  setLeftPanelView: React.Dispatch<
    React.SetStateAction<"toolPicker" | "toolContent">
  >;
  setReaderMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface SidebarProviderProps {
  children: React.ReactNode;
}

export interface ButtonConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  isRound?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  onClick: () => void;
  type?: "navigation" | "modal" | "action";
}

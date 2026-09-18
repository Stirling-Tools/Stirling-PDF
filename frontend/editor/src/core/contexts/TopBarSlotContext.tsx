import { createContext, useContext, type ReactNode } from "react";

const TopBarSlotContext = createContext<HTMLElement | null>(null);

interface TopBarSlotProviderProps {
  value: HTMLElement | null;
  children: ReactNode;
}

export function TopBarSlotProvider({
  value,
  children,
}: TopBarSlotProviderProps) {
  return (
    <TopBarSlotContext.Provider value={value}>
      {children}
    </TopBarSlotContext.Provider>
  );
}

/**
 * The full-width top-bar element the app shell renders above the rail and
 * sidebars. Null until the shell mounts it. Consumers render their bar content
 * into it with a portal, so the content keeps its React context while sitting in
 * a DOM node that spans the whole window (the AppFrame is its parent).
 */
export function useTopBarSlot() {
  return useContext(TopBarSlotContext);
}

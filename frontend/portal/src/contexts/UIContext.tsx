import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface UIContextValue {
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  assistantOpen: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;

  /** Settings is a modal overlay, not a route. */
  settingsOpen: boolean;
  /**
   * The section the Settings modal should land on when opened. `null` lets the
   * modal pick its own default. Cleared back to `null` on close.
   */
  settingsInitialSection: string | null;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    string | null
  >(null);

  const value = useMemo<UIContextValue>(
    () => ({
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      toggleSearch: () => setSearchOpen((o) => !o),

      assistantOpen,
      openAssistant: () => setAssistantOpen(true),
      closeAssistant: () => setAssistantOpen(false),
      toggleAssistant: () => setAssistantOpen((o) => !o),

      settingsOpen,
      settingsInitialSection,
      openSettings: (section?: string) => {
        setSettingsInitialSection(section ?? null);
        setSettingsOpen(true);
      },
      closeSettings: () => {
        setSettingsOpen(false);
        setSettingsInitialSection(null);
      },
    }),
    [searchOpen, assistantOpen, settingsOpen, settingsInitialSection],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const v = useContext(UIContext);
  if (!v) throw new Error("useUI must be used inside <UIProvider>");
  return v;
}

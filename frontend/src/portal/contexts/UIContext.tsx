import {
  createContext,
  useCallback,
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
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

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
    }),
    [searchOpen, assistantOpen],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const v = useContext(UIContext);
  if (!v) throw new Error("useUI must be used inside <UIProvider>");
  return v;
}

/**
 * Convenience hook — registers a global keyboard shortcut. Caller owns the
 * handler so the same hook works for ⌘K, ESC, etc.
 */
export function useKeyboardShortcut(
  match: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
) {
  // Use a stable handler ref via useCallback to keep dependencies stable.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (match(e)) handler(e);
    },
    [match, handler],
  );
  // Effect lives in the caller; keep this a pure utility.
  return onKey;
}

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

  /**
   * The account-link login modal. A single top-level instance — never nested in
   * another overlay. Opening it from within Settings closes Settings first (no
   * modal-in-modal) and reopens Settings on the account-link section once the
   * login modal closes, so the admin returns to where they were.
   */
  linkModalOpen: boolean;
  /**
   * "link" registers this instance (the normal first-time flow); "reauth" only
   * refreshes an expired SaaS session for attended reads — it must NOT re-register
   * (that would mint a duplicate device credential).
   */
  linkModalMode: "link" | "reauth";
  openLinkModal: (mode?: "link" | "reauth") => void;
  closeLinkModal: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    string | null
  >(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalMode, setLinkModalMode] = useState<"link" | "reauth">("link");
  // When the link modal is opened from inside Settings, remember the section to
  // restore so closing the modal returns the admin to where they were.
  const [reopenSettingsAfterLink, setReopenSettingsAfterLink] = useState<
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

      linkModalOpen,
      linkModalMode,
      openLinkModal: (mode: "link" | "reauth" = "link") => {
        setLinkModalMode(mode);
        // Never stack on Settings: close it first, and remember to reopen it on
        // the account-link section once the login modal closes.
        if (settingsOpen) {
          setReopenSettingsAfterLink("account-link");
          setSettingsOpen(false);
          setSettingsInitialSection(null);
        }
        setLinkModalOpen(true);
      },
      closeLinkModal: () => {
        setLinkModalOpen(false);
        setLinkModalMode("link");
        if (reopenSettingsAfterLink) {
          setSettingsInitialSection(reopenSettingsAfterLink);
          setSettingsOpen(true);
          setReopenSettingsAfterLink(null);
        }
      },
    }),
    [
      searchOpen,
      assistantOpen,
      settingsOpen,
      settingsInitialSection,
      linkModalOpen,
      linkModalMode,
      reopenSettingsAfterLink,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const v = useContext(UIContext);
  if (!v) throw new Error("useUI must be used inside <UIProvider>");
  return v;
}

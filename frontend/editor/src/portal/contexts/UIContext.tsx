import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConnectOutcome } from "@portal/components/account-link/ConnectCallbackView";

interface UIContextValue {
  /** Off-canvas sidebar drawer on small screens (no-op chrome on desktop). */
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;

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
  settingsInitialFocus: string | null;
  openSettings: (section?: string, focus?: string) => void;
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
  /**
   * The connect flow's last step, arriving after the admin has been to Stirling and back.
   *
   * A one-shot signal rather than a direct call, for the same reason
   * {@link UIContextValue.trialSetupRequested} is: the callback route and the dialog are mounted
   * separately, and there must only ever be one link dialog. The callback publishes the outcome,
   * this reopens the same dialog on step 3, and the admin lands where the progress bar said they
   * would rather than in a second dialog that looks nothing like the one they left.
   */
  connectOutcome: ConnectOutcome | null;
  publishConnectOutcome: (outcome: ConnectOutcome) => void;
  clearConnectOutcome: () => void;
  /**
   * A request to begin the enterprise trial, raised from wherever the buyer said yes (the billing
   * upsell, a sales link). The deal controller lives on Home, so this is a one-shot signal rather
   * than a direct call: Home consumes it, opens trial setup, and clears it.
   */
  trialSetupRequested: boolean;
  requestTrialSetup: () => void;
  clearTrialSetupRequest: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

const SIDEBAR_COLLAPSED_KEY = "stirling.portalSidebarCollapsed";

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // private mode / quota: silently no-op
  }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(readSidebarCollapsed);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    string | null
  >(null);
  const [settingsInitialFocus, setSettingsInitialFocus] = useState<
    string | null
  >(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [trialSetupRequested, setTrialSetupRequested] = useState(false);
  const [linkModalMode, setLinkModalMode] = useState<"link" | "reauth">("link");
  const [connectOutcome, setConnectOutcome] = useState<ConnectOutcome | null>(
    null,
  );
  // When the link modal is opened from inside Settings, remember the section to
  // restore so closing the modal returns the admin to where they were.
  const [reopenSettingsAfterLink, setReopenSettingsAfterLink] = useState<
    string | null
  >(null);

  const value = useMemo<UIContextValue>(
    () => ({
      // Opening any overlay (settings, link modal) dismisses the mobile nav
      // drawer so overlays never stack on top of it.
      mobileNavOpen,
      openMobileNav: () => setMobileNavOpen(true),
      closeMobileNav: () => setMobileNavOpen(false),
      toggleMobileNav: () => setMobileNavOpen((o) => !o),

      sidebarCollapsed,
      toggleSidebarCollapsed: () =>
        setSidebarCollapsed((c) => {
          const next = !c;
          writeSidebarCollapsed(next);
          return next;
        }),

      assistantOpen,
      openAssistant: () => setAssistantOpen(true),
      closeAssistant: () => setAssistantOpen(false),
      toggleAssistant: () => setAssistantOpen((o) => !o),

      settingsOpen,
      settingsInitialSection,
      settingsInitialFocus,
      openSettings: (section?: string, focus?: string) => {
        setMobileNavOpen(false);
        setSettingsInitialSection(section ?? null);
        setSettingsInitialFocus(focus ?? null);
        setSettingsOpen(true);
      },
      closeSettings: () => {
        setSettingsOpen(false);
        setSettingsInitialSection(null);
        setSettingsInitialFocus(null);
      },

      linkModalOpen,
      linkModalMode,
      openLinkModal: (mode: "link" | "reauth" = "link") => {
        setMobileNavOpen(false);
        setLinkModalMode(mode);
        // Never stack on Settings: close it first, and remember to reopen it on
        // the account-link section once the login modal closes.
        if (settingsOpen) {
          setReopenSettingsAfterLink("account-link");
          setSettingsOpen(false);
          setSettingsInitialSection(null);
          setSettingsInitialFocus(null);
        }
        setLinkModalOpen(true);
      },
      trialSetupRequested,
      requestTrialSetup: () => {
        setMobileNavOpen(false);
        setTrialSetupRequested(true);
      },
      clearTrialSetupRequest: () => setTrialSetupRequested(false),
      connectOutcome,
      publishConnectOutcome: (outcome: ConnectOutcome) => {
        setMobileNavOpen(false);
        setConnectOutcome(outcome);
        setLinkModalMode("link");
        setLinkModalOpen(true);
      },
      clearConnectOutcome: () => setConnectOutcome(null),
      closeLinkModal: () => {
        setLinkModalOpen(false);
        setLinkModalMode("link");
        // Dropped with the dialog: a reopen from a CTA is a fresh flow at step 1, not the
        // result of a handshake the admin has already dismissed.
        setConnectOutcome(null);
        if (reopenSettingsAfterLink) {
          setSettingsInitialSection(reopenSettingsAfterLink);
          setSettingsInitialFocus(null);
          setSettingsOpen(true);
          setReopenSettingsAfterLink(null);
        }
      },
    }),
    [
      mobileNavOpen,
      sidebarCollapsed,
      assistantOpen,
      settingsOpen,
      settingsInitialSection,
      settingsInitialFocus,
      linkModalOpen,
      linkModalMode,
      reopenSettingsAfterLink,
      trialSetupRequested,
      connectOutcome,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const v = useContext(UIContext);
  if (!v) throw new Error("useUI must be used inside <UIProvider>");
  return v;
}

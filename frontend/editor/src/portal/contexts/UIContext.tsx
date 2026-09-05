import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { navigateToSettings } from "@app/utils/settingsNavigation";
import type { NavKey } from "@app/components/shared/config/types";
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

  /**
   * Leave for the settings page, optionally on a named section and scrolled to
   * one control. Settings is app-wide and lives outside the processor, so this
   * navigates rather than opening an overlay.
   */
  openSettings: (section?: string, focus?: string) => void;

  /** The account-link login modal. A single top-level instance. */
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
   * A one-shot signal like {@link UIContextValue.trialSetupRequested}: the callback route and the
   * dialog mount separately, and there must only ever be one link dialog.
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
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [trialSetupRequested, setTrialSetupRequested] = useState(false);
  const [linkModalMode, setLinkModalMode] = useState<"link" | "reauth">("link");
  const [connectOutcome, setConnectOutcome] = useState<ConnectOutcome | null>(
    null,
  );
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

      openSettings: (section?: string, focus?: string) => {
        setMobileNavOpen(false);
        navigateToSettings(section as NavKey | undefined, focus);
      },

      linkModalOpen,
      linkModalMode,
      openLinkModal: (mode: "link" | "reauth" = "link") => {
        setMobileNavOpen(false);
        setLinkModalMode(mode);
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
        // A reopen from a CTA is a fresh flow, not a handshake already dismissed.
        setConnectOutcome(null);
      },
    }),
    [
      mobileNavOpen,
      sidebarCollapsed,
      assistantOpen,
      linkModalOpen,
      linkModalMode,
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

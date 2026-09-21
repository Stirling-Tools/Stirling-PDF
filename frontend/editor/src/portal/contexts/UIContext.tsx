import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { navigateToSettings } from "@app/utils/settingsNavigation";
import type { NavKey } from "@app/components/shared/config/types";
import type { ConnectOutcome } from "@app/portal/components/account-link/ConnectCallbackView";
import { clearPendingConnect } from "@app/portal/auth/pendingConnect";

/**
 * Why the dialog is open. All three run the same handshake; the mode only chooses the pitch.
 *
 * <p>{@code reauth} must NOT re-register, which would mint a duplicate device credential.
 */
export type LinkModalMode = "link" | "reauth" | "exhausted";

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
  linkModalMode: LinkModalMode;
  openLinkModal: (mode?: LinkModalMode) => void;
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
   * upsell). Usage & Billing consumes it once the deal is loaded, then starts or resumes the flow.
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
  const linkModalActive = useRef(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [trialSetupRequested, setTrialSetupRequested] = useState(false);
  const [linkModalMode, setLinkModalMode] = useState<LinkModalMode>("link");
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
      openLinkModal: (mode: LinkModalMode = "link") => {
        // Background failures must not replace a handoff or callback already in progress.
        if (linkModalActive.current) return;
        linkModalActive.current = true;
        setMobileNavOpen(false);
        setLinkModalMode(mode);
        setConnectOutcome(null);
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
        linkModalActive.current = true;
        setMobileNavOpen(false);
        setConnectOutcome(outcome);
        setLinkModalMode(outcome.mode ?? "link");
        setLinkModalOpen(true);
      },
      clearConnectOutcome: () => setConnectOutcome(null),
      closeLinkModal: () => {
        linkModalActive.current = false;
        connectOutcome?.cancel?.();
        clearPendingConnect();
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

import { useEffect, type ReactNode } from "react";
import { DesktopAccessGate } from "@editor/components/DesktopAccessGate";
import { DesktopConfigSync } from "@editor/components/DesktopConfigSync";
import { DesktopUpdatePopup } from "@editor/components/DesktopUpdatePopup";
import { LocalProcessingFolders } from "@editor/components/LocalProcessingFolders";
import { ProcessorPageHandlers } from "@editor/components/ProcessorPageHandlers";
import { SignInModal } from "@editor/components/SignInModal";
import { StartupPrompts } from "@editor-core/components/startup/StartupPrompts";
import UsageLimitModalHost from "@editor/components/UsageLimitModalHost";
import { useDesktopSession } from "@editor/components/DesktopSession";
import { useDesktopUpdatePopup } from "@editor/hooks/useDesktopUpdatePopup";
import { OPEN_SIGN_IN_EVENT } from "@editor/constants/signInEvents";

/**
 * Offers sign-in after an expired session fell back to local mode. A sibling
 * after SignInModal, so the modal is listening by the time this effect runs:
 * the access gate mounts both only once its own config read resolves.
 */
function PendingSignInPrompt() {
  const { pendingSignIn, consumePendingSignIn } = useDesktopSession();
  useEffect(() => {
    if (!pendingSignIn) return;
    window.dispatchEvent(
      new CustomEvent(OPEN_SIGN_IN_EVENT, { detail: { locked: false } }),
    );
    consumePendingSignIn();
  }, [pendingSignIn, consumePendingSignIn]);
  return null;
}

/**
 * Holds both apps back until the startup auth check settles the connection
 * mode, then behind managed sign-in. What both apps need on every page mounts
 * here once: sign-in, the usage-limit modals, background folder polling, the
 * startup prompts (from the app's own config, not the Processor's server) and
 * the editor's file handling on Processor pages.
 */
export function AppContentGate({ children }: { children: ReactNode }) {
  const { authChecked, initializeConnectionMode } = useDesktopSession();
  // Here, not in the popup: it renders in two places and must keep one state.
  const updatePopup = useDesktopUpdatePopup();

  return (
    <>
      {authChecked ? (
        <DesktopAccessGate onConfigLoaded={initializeConnectionMode}>
          <DesktopConfigSync />
          <StartupPrompts />
          <LocalProcessingFolders />
          <ProcessorPageHandlers />
          {children}
          {/* Always-mounted host for the PAYG usage-limit modals (free-limit /
              spend-cap). Resolves to the cloud implementation via @editor; listens
              for both the imperative open events (direct-call 402s) and the
              usageLimitBridge event (server-side policy/AI run 402s). */}
          <UsageLimitModalHost />
          {/* Global sign-in modal, opened via stirling:open-sign-in event */}
          <SignInModal />
          <PendingSignInPrompt />
          <DesktopUpdatePopup popup={updatePopup} />
        </DesktopAccessGate>
      ) : (
        <>
          {/* The title-bar strip (window controls) sits above, in the frame. */}
          <div style={{ height: "100%" }} />
          <DesktopUpdatePopup popup={updatePopup} />
        </>
      )}
    </>
  );
}

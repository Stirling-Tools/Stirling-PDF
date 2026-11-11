import type { ReactNode } from "react";
import { DesktopAccessGate } from "@editor/components/DesktopAccessGate";
import { DesktopConfigSync } from "@editor/components/DesktopConfigSync";
import { DesktopUpdatePopup } from "@editor/components/DesktopUpdatePopup";
import { LocalProcessingFolders } from "@editor/components/LocalProcessingFolders";
import { ProcessorPageHandlers } from "@editor/components/ProcessorPageHandlers";
import { SignInModal } from "@editor/components/SignInModal";
import UsageLimitModalHost from "@editor/components/UsageLimitModalHost";
import { useDesktopSession } from "@editor/components/DesktopSession";

/**
 * Holds both apps back until the startup auth check settles the connection
 * mode, then behind managed sign-in. What both apps need on every page mounts
 * here once: sign-in, the usage-limit modals, background folder polling, and
 * the editor's file handling on Processor pages.
 */
export function AppContentGate({ children }: { children: ReactNode }) {
  const { authChecked, initializeConnectionMode } = useDesktopSession();

  return (
    <>
      {authChecked ? (
        <DesktopAccessGate onConfigLoaded={initializeConnectionMode}>
          <DesktopConfigSync />
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
        </DesktopAccessGate>
      ) : (
        // The title-bar strip (window controls) sits above, in the frame.
        <div style={{ height: "100%" }} />
      )}
      <DesktopUpdatePopup />
    </>
  );
}

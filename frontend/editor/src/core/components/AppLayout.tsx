import { ReactNode } from "react";
import { useBanner } from "@app/contexts/BannerContext";
import { useGlobalFileDropGuard } from "@app/hooks/useGlobalFileDropGuard";
import NavigationWarningModal from "@app/components/shared/NavigationWarningModal";
import LoginAgreementModal from "@app/components/shared/LoginAgreementModal";

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * App layout wrapper that handles banner rendering and viewport sizing
 * Automatically adjusts child components to fit remaining space after banner
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { banner } = useBanner();

  // Stop stray file drops outside a dropzone from navigating the webview to
  // the file (which blocks the desktop app). See issue #6872.
  useGlobalFileDropGuard();

  return (
    <>
      <style>{`
        .h-screen {
          height: 100% !important;
        }
      `}</style>
      <div
        style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      >
        {banner}
        <div style={{ flex: 1, minHeight: 0, height: 0 }}>{children}</div>
      </div>
      <NavigationWarningModal />
      <LoginAgreementModal />
    </>
  );
}

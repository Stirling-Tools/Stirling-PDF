import { ReactNode } from "react";
import { useBanner } from "@app/contexts/BannerContext";
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

  return (
    <>
      <style>{`
        .h-screen {
          height: 100% !important;
        }
      `}</style>
      <div
        style={{
          // Viewport height minus the desktop custom title bar. --titlebar-h is
          // unset (0) on web/macOS/Linux, so this stays 100dvh there. Kept
          // viewport-relative on purpose: an ancestor (ThemeProvider) is only
          // min-height:100vh, so a percentage height here would collapse.
          height: "calc(100dvh - var(--titlebar-h, 0px))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {banner}
        <div style={{ flex: 1, minHeight: 0, height: 0 }}>{children}</div>
      </div>
      <NavigationWarningModal />
      <LoginAgreementModal />
    </>
  );
}

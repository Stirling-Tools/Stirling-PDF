import { ReactNode } from "react";
import { useBanner } from "@app/contexts/BannerContext";
import NavigationWarningModal from "@app/components/shared/NavigationWarningModal";
import { TitleBarSearch } from "@app/components/layout/TitleBarSearch";

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
          height: "var(--titlebar-body-h, 100dvh)",
          display: "flex",
          flexDirection: "column",
          // Keep the banner/header clear of the status bar on notched phones
          // when the webview extends under it (viewport-fit=cover). Zero on
          // desktop browsers, so this is a no-op everywhere else.
          paddingTop: "env(safe-area-inset-top, 0px)",
          boxSizing: "border-box",
        }}
      >
        {banner}
        <div style={{ flex: 1, minHeight: 0, height: 0 }}>{children}</div>
      </div>
      {/* Portals Super Search into the title-bar strip when a layer provides one;
          otherwise renders nothing. Kept here so it stays mounted across views. */}
      <TitleBarSearch />
      <NavigationWarningModal />
    </>
  );
}

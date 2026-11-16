import { ReactNode } from "react";
import { useBanner } from "@editor/contexts/BannerContext";
import NavigationWarningModal from "@editor/components/shared/NavigationWarningModal";
import { TitleBarSearch } from "@editor/components/layout/TitleBarSearch";

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

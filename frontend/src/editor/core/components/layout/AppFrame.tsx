import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@editor/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@editor/components/shared/quickNav/QuickNavRailHost";
import { TitleBarChrome } from "@editor/components/layout/TitleBarChrome";
import "@editor/components/layout/AppFrame.css";

/** The rail renders once outside both apps; Suspense sits inside it, not above. */
export function AppFrame() {
  return (
    <QuickNavHostProvider>
      <TitleBarChrome>
        <div className="app-frame">
          <QuickNavRailHost />
          <div className="app-frame__content">
            <Suspense fallback={<LoadingFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </TitleBarChrome>
    </QuickNavHostProvider>
  );
}

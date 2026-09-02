import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import { WindowTitleBar } from "@app/components/WindowTitleBar";
import "@app/components/layout/AppFrame.css";

/** The rail renders once outside both apps; Suspense sits inside it, not above. */
export function AppFrame() {
  return (
    <QuickNavHostProvider>
      <div className="app-frame">
        {/* Desktop (Windows) custom window chrome; null on web + macOS/Linux. It
            spans the full width above the rail so the panel dividers meet a clean
            edge instead of the native caption. */}
        <WindowTitleBar />
        <div className="app-frame__body">
          <QuickNavRailHost />
          <div className="app-frame__content">
            <Suspense fallback={<LoadingFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </div>
    </QuickNavHostProvider>
  );
}

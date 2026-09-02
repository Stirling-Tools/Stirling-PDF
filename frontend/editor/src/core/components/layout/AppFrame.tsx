import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import "@app/components/layout/AppFrame.css";

/** The rail renders once outside both apps; Suspense sits inside it, not above. */
export function AppFrame() {
  return (
    <QuickNavHostProvider>
      <div className="app-frame">
        <QuickNavRailHost />
        <div className="app-frame__content">
          <Suspense fallback={<LoadingFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </QuickNavHostProvider>
  );
}

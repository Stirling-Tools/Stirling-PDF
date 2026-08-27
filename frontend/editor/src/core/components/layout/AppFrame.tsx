import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import "@app/components/layout/AppFrame.css";

/**
 * Layout route wrapping the editor and the processor, so the rail renders once
 * outside both and a route change swaps only what is inside the Outlet. Inside
 * either app it would be torn down with that app's tree.
 *
 * Suspense sits here for the same reason: the processor is a lazy chunk, and a
 * fallback above this would replace the rail while it loads.
 *
 * Public routes stay outside this layout and get no chrome.
 */
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

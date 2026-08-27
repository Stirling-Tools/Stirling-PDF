import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import "@app/components/layout/AppFrame.css";

/**
 * Wraps both apps so the rail renders once outside them and a route change swaps only
 * the Outlet. Suspense sits here too: a fallback above it would replace the rail.
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

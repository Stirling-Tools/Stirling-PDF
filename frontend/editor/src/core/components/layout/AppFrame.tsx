import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import "@app/components/layout/AppFrame.css";

/**
 * Layout route wrapping the editor and the processor, so the quick nav rail is
 * rendered once outside both.
 *
 * This is what keeps the bar on screen across an app switch. Rendered inside
 * either app it would be torn down with that app's tree, and no animation can
 * cover an element that ceases to exist. Here the route change swaps only what
 * is inside the Outlet.
 *
 * The Suspense boundary belongs here rather than around the whole router for the
 * same reason: the processor is a lazy chunk, and a fallback hoisted above this
 * would replace the rail along with the app while it loads.
 *
 * Public routes - the mobile scanner, participant signing - sit outside this
 * layout, so they get no rail and no app chrome.
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

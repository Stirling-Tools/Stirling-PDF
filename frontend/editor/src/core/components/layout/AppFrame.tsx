import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import { TopBarSlotProvider } from "@app/contexts/TopBarSlotContext";
import "@app/components/layout/AppFrame.css";

/**
 * The app shell: a full-width top bar above a row of the rail and the mounted
 * app. The top bar is an empty slot here; the workbench fills it with a portal
 * (see WorkbenchTopBar) so its content keeps its React context while spanning
 * the whole window. Its window-control insets live in windowChrome.css.
 */
export function AppFrame() {
  const [topBar, setTopBar] = useState<HTMLElement | null>(null);
  return (
    <QuickNavHostProvider>
      <TopBarSlotProvider value={topBar}>
        <div className="app-frame">
          <header className="app-frame__topbar" ref={setTopBar} />
          <div className="app-frame__body">
            <QuickNavRailHost />
            <div className="app-frame__content">
              <Suspense fallback={<LoadingFallback />}>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </div>
      </TopBarSlotProvider>
    </QuickNavHostProvider>
  );
}

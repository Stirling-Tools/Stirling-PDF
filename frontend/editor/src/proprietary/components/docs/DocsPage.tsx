import { Suspense, lazy } from "react";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import { useOtherAppSwitch } from "@app/hooks/useOtherAppSwitch";
import "@portal/theme/base.css";
import "@app/components/docs/DocsPage.css";

// Its own chunk: the generated docs manifest is bundled JSON.
const DeveloperDocs = lazy(async () => {
  const m = await import("@portal/views/DeveloperDocs");
  return { default: m.DeveloperDocs };
});

/**
 * The documentation browser as a top-level page beside the editor and the
 * processor. The view is portal-authored, so it keeps the portal's scoped
 * reset; everything else (theme, Mantine, i18n) comes from the editor tree it
 * now mounts in.
 */
export default function DocsPage() {
  // The rail sits outside every app, so each page tells it what only the
  // signed-in session knows.
  const otherApp = useOtherAppSwitch();
  return (
    <div className="docs-page portal-scope">
      <QuickNavHostBridge portalAccess={Boolean(otherApp)} />
      <Suspense fallback={<LoadingFallback />}>
        <DeveloperDocs />
      </Suspense>
    </div>
  );
}

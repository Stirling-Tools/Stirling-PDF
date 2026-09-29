import { Suspense, lazy } from "react";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import "@app/components/docs/DocsPage.css";

// Its own chunk: the generated docs manifest is bundled JSON.
const DeveloperDocs = lazy(async () => {
  const m = await import("@app/components/docs/DeveloperDocs");
  return { default: m.DeveloperDocs };
});

/**
 * The documentation browser as a top-level page beside the editor and the
 * processor. Every build ships it: the docs describe the product, not the
 * processor, so gating them on that build flag hid them from the editions most
 * likely to need them.
 */
export default function DocsPage() {
  return (
    <div className="docs-page">
      <QuickNavHostBridge />
      <Suspense fallback={<LoadingFallback />}>
        <DeveloperDocs />
      </Suspense>
    </div>
  );
}

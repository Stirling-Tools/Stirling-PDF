import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import HomePage from "@app/pages/HomePage";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { stripBasePath } from "@app/constants/app";
import { DOCS_PATH, HAS_DOCS } from "@app/routes/docsRoute";

// Their own chunks: the settings tree (admin sections, account, licence flows)
// and the docs manifest are both large, and most sessions open neither.
const SettingsPage = lazy(() => import("@app/pages/SettingsPage"));
const DocsPage = lazy(() => import("@app/components/docs/DocsPage"));

/**
 * What the editor's route-set renders: the workbench, or one of the pages that
 * sit beside it. A switch rather than sibling routes so all of them inherit the
 * one auth/backend gate the host route already applies.
 */
export function AppRoot() {
  const { pathname } = useLocation();
  const path = stripBasePath(pathname);

  if (path.startsWith("/settings")) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <SettingsPage />
      </Suspense>
    );
  }

  if (HAS_DOCS && path.startsWith(DOCS_PATH)) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <DocsPage />
      </Suspense>
    );
  }

  return <HomePage />;
}

import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import HomePage from "@editor/pages/HomePage";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { stripBasePath } from "@editor/constants/app";
import { DOCS_PATH, HAS_DOCS } from "@editor/routes/docsRoute";
import { StartupPrompts } from "@editor/components/startup/StartupPrompts";
import { usePdfEngineWarmUp } from "@editor/hooks/usePdfEngineWarmUp";

// Their own chunks: the settings tree (admin sections, account, licence flows)
// and the docs manifest are both large, and most sessions open neither.
const SettingsPage = lazy(() => import("@editor/pages/SettingsPage"));
const DocsPage = lazy(() => import("@editor/components/docs/DocsPage"));

function AppContent() {
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

/** The editor's authenticated or login-disabled routes, including catch-all entries. */
export function AppRoot() {
  usePdfEngineWarmUp();
  return (
    <>
      <StartupPrompts />
      <AppContent />
    </>
  );
}

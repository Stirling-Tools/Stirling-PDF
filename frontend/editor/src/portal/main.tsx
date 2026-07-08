// Standalone entry for the admin portal built as its own app (portal.html),
// embedded in the JAR at /portal alongside the editor. In dev the portal is
// still reachable as a lazy route inside the editor (see adminRouteExtensions);
// this bootstrap is what the production /portal bundle mounts.

// Must be imported before React so the DOM-prototype patch is installed before
// React's commit phase runs. Prevents browser page translators from crashing
// the app via parent-mismatch DOMExceptions. See the module for details.
import "@app/utils/patchDomForTranslators";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "../../vite-env.d.ts"; // eslint-disable-line no-restricted-imports -- Outside app paths
import "@app/styles/index.css"; // Import global styles
// SUI design tokens (--color-bg, --color-surface, --color-text-*, --font-sans …)
// for both [data-theme="light"] and [data-theme="dark"]. The portal's Mantine
// theme binds its surface/text/border variables to these, so without this import
// the portal renders unthemed (flat, no card surfaces) — the editor gets it for
// free via the core ThemeProvider, which the standalone portal doesn't use.
import "@app/tokens/tokens.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ColorSchemeScript } from "@mantine/core";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@app/i18n"; // Initialize i18next
import { PortalApp } from "@portal/PortalApp";
import { startPortalMocksIfEnabled } from "@portal/mocks/startIfEnabled";

/**
 * react-router basename = the deploy's context path ONLY (not /portal).
 *
 * The portal builds absolute `/portal/...` links itself (PORTAL_BASENAME in
 * ViewContext) and mounts under a `/portal/*` route below — mirroring how the
 * editor hosts the portal. If the basename included /portal, those links would
 * double-prefix to /portal/portal/... The injected API base is the context path
 * ("/" at root, "/foo/" under a subpath deploy), which is exactly the basename.
 */
function contextBasename(): string {
  const apiBase =
    (typeof window !== "undefined" &&
      (window as { STIRLING_PDF_API_BASE_URL?: string })
        .STIRLING_PDF_API_BASE_URL) ||
    "/";
  return apiBase.replace(/\/+$/, "");
}

async function bootstrap() {
  // No-op unless mocks are explicitly enabled (dev/preview only). Started before
  // the first render so the worker intercepts the portal's initial fetches.
  await startPortalMocksIfEnabled();

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root container missing in portal.html");
  }

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ColorSchemeScript />
      <BrowserRouter basename={contextBasename()}>
        <Routes>
          {/* PortalApp owns everything under /portal (its ViewRouter's routes
              are relative to this mount). */}
          <Route path="/portal/*" element={<PortalApp />} />
          {/* The bundle is only ever served at /portal, but redirect any stray
              path to the portal root defensively. */}
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();

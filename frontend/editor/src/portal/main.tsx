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
import React from "react";
import ReactDOM from "react-dom/client";
import { ColorSchemeScript } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import "@app/i18n"; // Initialize i18next
import { BASE_PATH } from "@app/constants/app";
import { PortalApp } from "@portal/PortalApp";
import { startPortalMocksIfEnabled } from "@portal/mocks/startIfEnabled";

async function bootstrap() {
  // No-op unless mocks are explicitly enabled (dev/preview only). Started before
  // the first render so the worker intercepts the portal's initial fetches.
  await startPortalMocksIfEnabled();

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root container missing in portal.html");
  }

  // BASE_PATH is read from the <base href> the backend rewrites to
  // ${contextPath}/portal/, so BrowserRouter's basename mounts the portal's
  // routes under /portal. PortalApp supplies its own providers (auth, theme).
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ColorSchemeScript />
      <BrowserRouter basename={BASE_PATH}>
        <PortalApp />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();

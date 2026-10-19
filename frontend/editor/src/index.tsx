// Must be imported before React so the DOM-prototype patch is installed
// before React's commit phase runs. Prevents browser page translators
// (Edge / Google Translate / extensions) from crashing the app via
// parent-mismatch DOMExceptions. See the module for details.
import "@app/utils/patchDomForTranslators";
// WebKit is missing several APIs the app assumes (ReadableStream async
// iteration, which pdf.js needs for all text extraction; requestIdleCallback).
import "@app/utils/engineShims";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "../vite-env.d.ts"; // oxlint-disable-line no-restricted-imports -- Outside app paths
import "@app/styles/index.css"; // Import global styles
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@app/App";
import { i18nReady } from "@app/i18n";
import { BASE_PATH } from "@app/constants/app";
import { applyDevWorktreeLabel } from "@app/utils/applyDevWorktreeLabel";

applyDevWorktreeLabel();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container missing in index.html");
}

const root = ReactDOM.createRoot(container);
void i18nReady.then(() => {
  root.render(
    <React.StrictMode>
      <BrowserRouter basename={BASE_PATH}>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
  container.removeAttribute("data-shell");
  for (const attribute of [
    "data-shell-hidden",
    "data-shell-mode",
    "data-shell-route",
    "data-shell-auth",
    "data-shell-login",
  ]) {
    document.documentElement.removeAttribute(attribute);
  }
});

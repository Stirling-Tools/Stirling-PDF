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
import { ColorSchemeScript } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import App from "@app/App";
import "@app/i18n"; // Initialize i18next
import { BASE_PATH } from "@app/constants/app";
import { applyDevWorktreeLabel } from "@app/utils/applyDevWorktreeLabel";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

applyDevWorktreeLabel();
startEagerWasmCompilation();
if (typeof window !== "undefined") {
  try {
    const protoDescriptor =
      Object.getOwnPropertyDescriptor(Window.prototype, "devicePixelRatio") ||
      Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    const fallbackDPR = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", {
      get() {
        const currentDPR = protoDescriptor?.get
          ? protoDescriptor.get.call(window)
          : fallbackDPR;
        return Math.min(currentDPR || 1, 1.5);
      },
      configurable: true,
    });
  } catch (error) {
    console.warn("Failed to override window.devicePixelRatio:", error);
  }

  const scheduleCompilation = () =>
    requestIdleCallback(() => startEagerWasmCompilation(), { timeout: 2000 });

  if (document.readyState === "complete") {
    scheduleCompilation();
  } else {
    window.addEventListener("load", scheduleCompilation);
  }
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container missing in index.html");
}

const root = ReactDOM.createRoot(container); // Finds the root DOM element
root.render(
  <React.StrictMode>
    <ColorSchemeScript />
    <BrowserRouter basename={BASE_PATH}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

/// <reference types="vite/client" />
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@portal/App";
import { readMocksPreference } from "@portal/mocks/preference";
// Initialise i18n (side effect) before the app renders.
import "@portal/i18n/config";

// Mantine's prebuilt styles load first so SUI tokens/base can override on
// conflicts — SUI is the primary design language, Mantine the escape hatch.
import "@mantine/core/styles.css";
import "@shared/tokens/tokens.css";
import "@shared/tokens/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

// Start MSW before React mounts when the user has mocks enabled. The
// preference defaults to ON in dev / OFF in production. The toggle in the
// header flips it at runtime.
async function bootstrap(): Promise<void> {
  if (readMocksPreference()) {
    // Dynamic import keeps MSW + every handler + every fixture out of any
    // chunk that doesn't need to actually run the worker.
    const { startMockWorker } = await import("@portal/mocks/browser");
    await startMockWorker();
  }

  createRoot(root!).render(
    <StrictMode>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </StrictMode>,
  );
}

void bootstrap();

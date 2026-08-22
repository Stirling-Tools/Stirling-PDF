import { Loader } from "@mantine/core";
import { Suspense, lazy, useEffect, useState } from "react";
import type {
  ConfigNavSection,
  NavKey,
} from "@app/components/shared/config/types";

// AppConfigModal pulls in the entire settings UI tree (admin sections,
// account, supabase auth flows, etc.). Keep the import deferred, but share the
// promise so callers can preload it before the modal is opened.
let appConfigModalPromise: Promise<
  typeof import("@app/components/shared/AppConfigModal")
> | null = null;
let generalSectionPromise: Promise<
  typeof import("@app/components/shared/config/configSections/GeneralSection")
> | null = null;

const loadAppConfigModal = () => {
  appConfigModalPromise ??= import("@app/components/shared/AppConfigModal");
  return appConfigModalPromise;
};

const loadGeneralSection = () => {
  generalSectionPromise ??=
    import("@app/components/shared/config/configSections/GeneralSection");
  return generalSectionPromise;
};

const AppConfigModal = lazy(loadAppConfigModal);

export function preloadAppConfigModal() {
  void loadAppConfigModal();
  void loadGeneralSection();
}

interface AppConfigModalLazyProps {
  opened: boolean;
  onClose: () => void;
  /** See AppConfigModal — off for hosts outside the /settings route. */
  urlSync?: boolean;
  /** Section to land on when opening (non-URL hosts). */
  initialSection?: NavKey | null;
  /** Row anchor to highlight when opening (non-URL hosts). */
  initialFocus?: string | null;
  /** Host-specific sections appended after the build's registry sections. */
  extraSections?: ConfigNavSection[];
  /** Registry section keys to drop, for hosts a section can't run in. */
  hiddenSectionKeys?: NavKey[];
}

export default function AppConfigModalLazy({
  opened,
  onClose,
  urlSync,
  initialSection,
  initialFocus,
  extraSections,
  hiddenSectionKeys,
}: AppConfigModalLazyProps) {
  const [shouldMount, setShouldMount] = useState(false);

  // Settings is opened frequently from the persistent sidebar. Warm the two
  // chunks needed for the initial screen after the main page has painted, so
  // the first click does not have to wait for module evaluation.
  useEffect(() => {
    const timer = window.setTimeout(preloadAppConfigModal, 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Unmount the settings tree immediately on close. Keeping the hidden tree
    // alive makes Mantine's overlay transition re-layout the entire settings
    // page and blocks the close click on large admin builds.
    setShouldMount(opened);
  }, [opened]);

  return (
    <Suspense
      fallback={
        opened ? (
          <div
            role="status"
            aria-label="Loading settings"
            style={{
              position: "fixed",
              inset: 0,
              display: "grid",
              placeItems: "center",
              zIndex: 1300,
              background: "var(--c-overlay, rgba(0, 0, 0, 0.35))",
            }}
          >
            <Loader size="sm" />
          </div>
        ) : null
      }
    >
      {shouldMount && (
        <AppConfigModal
          opened={opened}
          onClose={onClose}
          urlSync={urlSync}
          initialSection={initialSection}
          initialFocus={initialFocus}
          extraSections={extraSections}
          hiddenSectionKeys={hiddenSectionKeys}
        />
      )}
    </Suspense>
  );
}

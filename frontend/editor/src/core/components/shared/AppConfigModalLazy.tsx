import { Suspense, lazy, useEffect, useState } from "react";
import type {
  ConfigNavSection,
  NavKey,
} from "@app/components/shared/config/types";

// AppConfigModal pulls in the entire settings UI tree (admin sections,
// account, supabase auth flows, etc.). We defer loading until the user first
// opens the modal, then keep it mounted so the close animation runs.
const AppConfigModal = lazy(
  () => import("@app/components/shared/AppConfigModal"),
);

interface AppConfigModalLazyProps {
  opened: boolean;
  onClose: () => void;
  /** See AppConfigModal — off for hosts outside the /settings route. */
  urlSync?: boolean;
  /** Section to land on when opening (non-URL hosts). */
  initialSection?: NavKey | null;
  /** Host-specific sections appended after the build's registry sections. */
  extraSections?: ConfigNavSection[];
}

export default function AppConfigModalLazy({
  opened,
  onClose,
  urlSync,
  initialSection,
  extraSections,
}: AppConfigModalLazyProps) {
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (opened) setShouldMount(true);
  }, [opened]);

  return (
    <Suspense fallback={null}>
      {shouldMount && (
        <AppConfigModal
          opened={opened}
          onClose={onClose}
          urlSync={urlSync}
          initialSection={initialSection}
          extraSections={extraSections}
        />
      )}
    </Suspense>
  );
}

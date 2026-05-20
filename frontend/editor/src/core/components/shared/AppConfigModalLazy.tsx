import { Suspense, lazy, useEffect, useState } from "react";

// AppConfigModal pulls in the entire settings UI tree (admin sections,
// account, supabase auth flows, etc.). We defer loading until the user first
// opens the modal, then keep it mounted so the close animation runs.
const AppConfigModal = lazy(
  () => import("@app/components/shared/AppConfigModal"),
);

interface AppConfigModalLazyProps {
  opened: boolean;
  onClose: () => void;
}

export default function AppConfigModalLazy({
  opened,
  onClose,
}: AppConfigModalLazyProps) {
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (opened) setShouldMount(true);
  }, [opened]);

  if (!shouldMount) return null;

  return (
    <Suspense fallback={null}>
      <AppConfigModal opened={opened} onClose={onClose} />
    </Suspense>
  );
}

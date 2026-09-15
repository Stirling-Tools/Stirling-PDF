import { lazy, Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcessingFolderCreation } from "@core/hooks/useProcessingFolderCreation";

export type { ProcessingFolderCreation };

export const canCreateProcessingFolders = true;

const Setup = lazy(async () => {
  const module =
    await import("@app/components/policies/ProcessingFolderSetupFlow");
  return { default: module.ProcessingFolderSetupFlow };
});

/** The wizard stays inside the editor's file providers when opened from the outer navigation rail. */
export function useProcessingFolderCreation(): ProcessingFolderCreation {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const open = useCallback(() => setOpened(true), []);
  const close = useCallback(() => setOpened(false), []);

  return {
    open,
    dialog: opened ? (
      <Suspense
        fallback={<span role="status">{t("loading", "Loading...")}</span>}
      >
        <Setup onClose={close} />
      </Suspense>
    ) : null,
  };
}

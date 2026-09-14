import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import type { CreateProcessingFolderButtonProps } from "@core/components/policies/CreateProcessingFolderButton";
import "@app/components/policies/FolderProcessingSetup.css";

export type { CreateProcessingFolderButtonProps };

const Setup = lazy(async () => {
  const module =
    await import("@app/components/policies/ProcessingFolderSetupFlow");
  return { default: module.ProcessingFolderSetupFlow };
});

/** Both CTAs open the same creation flow; the wizard owns destination availability. */
export function CreateProcessingFolderButton({
  placement,
  collapsed,
}: CreateProcessingFolderButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("processingFolders.setup.title");
  return (
    <>
      <div className={`folder-setup-cta folder-setup-cta--${placement}`}>
        <Tooltip label={label} disabled={!collapsed} position="right">
          <Button
            variant="tertiary"
            fullWidth={placement === "sidebar"}
            aria-label={label}
            onClick={() => setOpen(true)}
            leftSection={<Icon name="folder-plus" size={18} />}
          >
            {!collapsed && label}
          </Button>
        </Tooltip>
      </div>
      {open && (
        <Suspense
          fallback={<span role="status">{t("loading", "Loading...")}</span>}
        >
          <Setup onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

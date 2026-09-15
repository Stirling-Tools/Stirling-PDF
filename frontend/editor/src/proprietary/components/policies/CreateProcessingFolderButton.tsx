import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useProcessingFolderCreation } from "@app/hooks/useProcessingFolderCreation";

/** Both CTAs open the same creation flow; the wizard owns destination availability. */
export function CreateProcessingFolderButton() {
  const { t } = useTranslation();
  const creation = useProcessingFolderCreation();
  const label = t("processingFolders.setup.title");
  return (
    <>
      <Button
        variant="secondary"
        fat
        onClick={(event) => {
          event.stopPropagation();
          creation.open?.();
        }}
        leftSection={<Icon name="folder-plus" size="1rem" />}
      >
        {label}
      </Button>
      {creation.dialog}
    </>
  );
}

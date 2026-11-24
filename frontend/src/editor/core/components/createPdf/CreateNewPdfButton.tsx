import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useCreatePdf } from "@editor/hooks/useCreatePdf";

export function CreateNewPdfButton() {
  const { t } = useTranslation();
  const { stage, createBlank } = useCreatePdf();
  return (
    <Button
      variant="secondary"
      leftSection={<Icon name="file-plus" size="1rem" />}
      loading={stage !== "idle"}
      onClick={() => void createBlank()}
      data-testid="pdf-editor-create-new-pdf"
    >
      {t("createPdf.newPdf", "Create new PDF")}
    </Button>
  );
}

import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";

/** Asks to close the review; the editor answers once unsaved tags are dealt with. */
export function CloseReviewButton() {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant="primary"
      onClick={() => reviewMode.requestClose()}
      leftSection={<Icon name="x" size={18} />}
      data-testid="pdf-editor-review-close"
      style={NO_SHRINK}
    >
      {t("pdfTextEditor.review.close", "Close accessibility settings")}
    </Button>
  );
}

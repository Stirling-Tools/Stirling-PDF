import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { NO_SHRINK } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  reviewMode,
  useReviewMode,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import { useEditOrReview } from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";

/** Enters accessibility review, leaving the editor tool for it, or closes it from whichever tool it runs under. */
export function ReviewToggle() {
  const { t } = useTranslation();
  const { reviewing } = useReviewMode();
  const { startReview } = useEditOrReview();
  return (
    <Tooltip
      label={t(
        "pdfTextEditor.review.toggleTooltip",
        "Show every tag on the page and tag what is missing, one item after another",
      )}
      disabled={reviewing}
    >
      <Button
        size="sm"
        variant={reviewing ? "primary" : "secondary"}
        aria-pressed={reviewing}
        onClick={() => (reviewing ? reviewMode.requestClose() : startReview())}
        leftSection={
          <Icon name={reviewing ? "x" : "universal-access"} size={18} />
        }
        data-testid="pdf-editor-review-toggle"
        style={NO_SHRINK}
      >
        {reviewing
          ? t("pdfTextEditor.review.close", "Close accessibility settings")
          : t("pdfTextEditor.review.toggle", "Review accessibility")}
      </Button>
    </Tooltip>
  );
}

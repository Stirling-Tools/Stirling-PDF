import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";

/** Selects the next image or text the accessibility review flags. */
export function NextToReviewButton({
  onClick,
  testId,
}: {
  onClick: () => void;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant="secondary"
      accent="neutral"
      fullWidth
      justify="start"
      leftSection={<Icon name="arrow-right" size={20} />}
      onClick={onClick}
      data-testid={testId}
    >
      {t(
        "pdfTextEditor.inspector.accessibility.nextToReview",
        "Next to review",
      )}
    </Button>
  );
}

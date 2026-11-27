import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";

/**
 * Reopens a document the editor dropped when its PDFium aborted. The editor
 * will not retry a file showing an error on its own, so this is the way back.
 */
export function ReopenLostDocumentButton({
  lost,
  file,
  onReopen,
}: {
  lost: boolean;
  file: File | null | undefined;
  onReopen: (file: File) => void;
}) {
  const { t } = useTranslation();
  if (!lost || !file) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => onReopen(file)}
      data-testid="pdf-editor-reopen-lost"
    >
      {t("pdfTextEditor.error.reopenLost", "Open again")}
    </Button>
  );
}

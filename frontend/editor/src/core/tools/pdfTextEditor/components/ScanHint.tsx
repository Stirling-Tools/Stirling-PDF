import { Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { useToolWorkflowActions } from "@app/contexts/ToolWorkflowContext";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";

// A page that is one big picture with no text on it: a scan nobody has OCR'd.
function isUnreadScan(page: PageSnapshot): boolean {
  if (page.runs.length > 0) return false;
  const area = page.width * page.height;
  return page.images.some(
    (img) => img.bounds.width * img.bounds.height > area * 0.5,
  );
}

/** Points a user at OCR when the pages they opened are scans with no text. */
export function ScanHint({ pages }: { pages: PageSnapshot[] }) {
  const { t } = useTranslation();
  const { handleToolSelect } = useToolWorkflowActions();
  const scans = pages.filter(isUnreadScan).length;
  if (scans === 0) return null;
  return (
    <Stack gap={6} align="center" data-testid="pdf-editor-scan-hint">
      <Text size="xs" c="dimmed" ta="center">
        {t("pdfTextEditor.inspector.scanHint", {
          count: scans,
          defaultValue_one:
            "This page is a scanned image with no text to edit. Run OCR first to make its text editable.",
          defaultValue_other:
            "{{count}} pages are scanned images with no text to edit. Run OCR first to make their text editable.",
        })}
      </Text>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => handleToolSelect("ocr")}
        data-testid="pdf-editor-scan-hint-ocr"
      >
        {t("pdfTextEditor.inspector.runOcr", "Run OCR")}
      </Button>
    </Stack>
  );
}

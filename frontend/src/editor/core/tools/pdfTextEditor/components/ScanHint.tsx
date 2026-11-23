import { useId } from "react";
import { Stack, Text } from "@mantine/core";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

// A page that is one big picture with no text on it: a scan nobody has OCR'd.
function isUnreadScan(page: PageSnapshot): boolean {
  if (page.runs.length > 0) return false;
  const area = page.width * page.height;
  return page.images.some(
    (img) => img.bounds.width * img.bounds.height > area * 0.5,
  );
}

// "Print to PDF" and some exporters draw every letter as an outline and write no text at all.
const LETTER_SHAPES_MIN = 80;
const LETTER_MAX_HEIGHT_PT = 30;

function isOutlinedText(page: PageSnapshot): boolean {
  if (page.runs.length > 0) return false;
  const letters = (page.shapes ?? []).filter(
    (shape) =>
      shape.bounds.height > 0 &&
      shape.bounds.height <= LETTER_MAX_HEIGHT_PT &&
      shape.bounds.width <= LETTER_MAX_HEIGHT_PT * 2,
  );
  return letters.length >= LETTER_SHAPES_MIN;
}

/** Offers OCR when the pages they opened are scans with no text. */
export interface ScanHintProps {
  pages: PageSnapshot[];
  onRunOcr: () => void;
  ocrRunning: boolean;
  ocrAvailable: boolean | null;
  ocrBlockedReason?: string | null;
  onRemovePassword?: () => void;
}

export function ScanHint({
  pages,
  onRunOcr,
  ocrRunning,
  ocrAvailable,
  ocrBlockedReason,
  onRemovePassword,
}: ScanHintProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  const scans = pages.filter(isUnreadScan).length;
  const outlined = pages.filter(
    (page) => !isUnreadScan(page) && isOutlinedText(page),
  ).length;
  if (scans + outlined === 0) return null;
  return (
    <Stack gap={6} align="center" data-testid="pdf-editor-scan-hint">
      <Text size="xs" c="dimmed" ta="center">
        {scans === 0
          ? t("pdfTextEditor.inspector.outlinedTextHint", {
              count: outlined,
              defaultValue_one:
                "This page's text is drawn as shapes, so there is no text to edit. Run OCR first to make it editable.",
              defaultValue_other:
                "{{count}} pages have their text drawn as shapes, so there is no text to edit. Run OCR first to make it editable.",
            })
          : outlined > 0
            ? t("pdfTextEditor.inspector.unreadPagesHint", {
                count: scans + outlined,
                defaultValue:
                  "{{count}} pages have no text to edit: some are scanned images and some draw their text as shapes. Run OCR first to make them editable.",
              })
            : t("pdfTextEditor.inspector.scanHint", {
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
        onClick={onRunOcr}
        loading={ocrRunning}
        disabled={!ocrAvailable || !!ocrBlockedReason}
        aria-describedby={ocrBlockedReason ? reasonId : undefined}
        data-testid="pdf-editor-scan-hint-ocr"
      >
        {t("pdfTextEditor.inspector.runOcr", "Run OCR")}
      </Button>
      {ocrBlockedReason && (
        <Stack gap={6} align="center">
          <Text id={reasonId} size="xs" ta="center" role="note">
            {ocrBlockedReason}
          </Text>
          {onRemovePassword && (
            <Tooltip
              content={t(
                "encryptedPdfUnlock.removePasswordHelp",
                "Open Remove Password to choose which passwords to remove.",
              )}
              position="top"
              maxWidth={230}
              arrow
            >
              <Button
                size="sm"
                variant="tertiary"
                leftSection={<Icon name="lock-open" size={16} />}
                onClick={onRemovePassword}
                disabled={ocrRunning}
              >
                {t("removePassword.submit", "Remove Password")}
              </Button>
            </Tooltip>
          )}
        </Stack>
      )}
      {ocrAvailable === false && !ocrRunning && (
        <Text size="xs" c="dimmed" ta="center">
          {t(
            "pdfTextEditor.inspector.ocrUnavailable",
            "OCR is unavailable on this server.",
          )}
        </Text>
      )}
    </Stack>
  );
}

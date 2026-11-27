import { Popover, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { GeometryFields } from "@editor/tools/pdfTextEditor/components/inspector/SelectionInspector";
import type { SelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import type { ScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
import {
  NO_SHRINK,
  selectionBarMenuProps,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";

/** Position and size behind one button, for a single selected text box or image. */
export function GeometryMenu({
  geometry,
  isImage,
  dropdownPosition,
}: {
  geometry: SelectionGeometry;
  isImage: boolean;
  dropdownPosition: "top" | "bottom";
}) {
  const { t } = useTranslation();
  const title = t("pdfTextEditor.inspector.geometry", "Position & size");
  const single = geometry.single;
  return (
    <Popover position={dropdownPosition} withinPortal shadow="md" trapFocus>
      <Tooltip
        label={
          single
            ? title
            : t(
                "pdfTextEditor.inspector.multiGeometry",
                "Select a single object to edit its position and size.",
              )
        }
      >
        <Popover.Target>
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            disabled={!single}
            aria-label={title}
            data-testid="pdf-editor-geometry-menu"
            style={NO_SHRINK}
            leftSection={<Icon name="move" size={20} />}
          />
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown {...selectionBarMenuProps}>
        {single && (
          <Stack gap="xs" w={240} data-testid="pdf-editor-geometry-section">
            <Text size="xs" fw={500}>
              {title}
            </Text>
            <GeometryFields single={single} isImage={isImage} />
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * What the selection needs the user to know: why typing will not come out as
 * expected, or that a scanned block's font can be picked by eye.
 */
export function SelectionNotices({
  note,
  scanFontMatch,
}: {
  note: string | null;
  scanFontMatch: ScanFontMatch | null;
}) {
  const { t } = useTranslation();
  const scanLabel = scanFontMatch?.approximate
    ? t(
        "pdfTextEditor.scanFont.approximateHint",
        "The closest font found may not match the scan.",
      )
    : scanFontMatch?.undrawable
      ? t(
          "pdfTextEditor.scanFont.chooseMissing",
          "Choose a font for this text…",
        )
      : t("pdfTextEditor.scanFont.change", "Font not looking right?");
  return (
    <>
      {note && (
        <Tooltip label={note} multiline w={240}>
          <span
            role="img"
            aria-label={note}
            tabIndex={0}
            data-testid="pdf-editor-inspector-font-note"
            style={{
              ...NO_SHRINK,
              display: "inline-flex",
              alignItems: "center",
              paddingInline: "0.375rem",
              color: "var(--c-warning)",
              cursor: "help",
            }}
          >
            <Icon name="circle-alert" size={18} />
          </span>
        </Tooltip>
      )}
      {scanFontMatch?.canShow && (
        <Tooltip label={scanLabel} multiline w={240}>
          <Button
            variant="tertiary"
            accent={scanFontMatch.approximate ? "warning" : "neutral"}
            size="sm"
            onClick={scanFontMatch.show}
            aria-label={scanLabel}
            data-testid="pdf-editor-scan-font-open"
            style={NO_SHRINK}
            leftSection={<Icon name="case-sensitive" size={20} />}
          />
        </Tooltip>
      )}
    </>
  );
}

import { Select, Tooltip } from "@mantine/core";
import { useState, type ReactElement } from "react";
import {
  CHARCODE_STRATEGIES,
  CharcodeStrategy,
  getActiveCharcodeStrategy,
  setActiveCharcodeStrategy,
} from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

/**
 * Toolbar dropdown for switching the active Unicode→charcode strategy
 * used when inserting new chars into an existing embedded subset font.
 *
 * Three strategies are real and selectable:
 *   - `helvetica` (default): falls back to Helvetica for any new char.
 *   - `cmap`: parses the embedded font's TrueType/OpenType cmap table
 *     and uses the glyph index as the charcode for SetCharcodes.
 *   - `content-stream`: scans the page's existing text via
 *     FPDFText_GetTextObject/GetUnicode and builds a per-font
 *     Unicode→position map.
 *   - `backend`: stub - logs a warning and falls back to Helvetica.
 *     Will POST to a Spring/PDFBox endpoint when wired.
 *
 * The choice persists in localStorage. URL param
 * `?charcodeStrategy=<name>` overrides it per-window so two tabs can
 * compare strategies side-by-side without local-storage contention.
 */
export function CharcodeStrategyPicker(): ReactElement {
  const [value, setValue] = useState<CharcodeStrategy>(() =>
    getActiveCharcodeStrategy(),
  );
  return (
    <Tooltip
      label="Charcode strategy for typing into embedded-font runs (experimental)"
      withinPortal
    >
      <Select
        size="xs"
        w={170}
        data-testid="v2-charcode-strategy"
        value={value}
        data={CHARCODE_STRATEGIES.map((s) => ({ value: s, label: s }))}
        onChange={(v) => {
          const next = (v as CharcodeStrategy) ?? "helvetica";
          setActiveCharcodeStrategy(next);
          setValue(next);
        }}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
    </Tooltip>
  );
}

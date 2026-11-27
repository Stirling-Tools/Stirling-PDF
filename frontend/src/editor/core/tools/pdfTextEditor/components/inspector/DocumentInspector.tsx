import { useState } from "react";
import {
  Badge,
  Box,
  Collapse,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import ToolStep from "@editor/components/tools/shared/ToolStep";
import { DisclosureRow } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  analyzePageFonts,
  type PageFont,
} from "@editor/tools/pdfTextEditor/util/pageFonts";
import {
  AdvancedSettings,
  ViewSettings,
} from "@editor/tools/pdfTextEditor/components/inspector/DocumentSettings";
import type {
  GroupingMode,
  PageSnapshot,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";

interface Props {
  pages: PageSnapshot[];
  groupingMode: GroupingMode;
  widthMode: WidthMode;
  showRulers: boolean;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
  onSetShowRulers: (show: boolean) => void;
}

/**
 * The open document's fonts and settings. Nothing here acts on a selection.
 * Laid out as the collapsible steps every other tool's settings use.
 */
export function DocumentInspector({
  pages,
  groupingMode,
  widthMode,
  onSetGroupingMode,
  onSetWidthMode,
  ...view
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <Box
      pt="xs"
      data-testid="pdf-editor-document-panel"
      style={{
        // With the step's own 0.5rem, headings line up with the sections above.
        paddingInline: "0.5rem",
        borderTop: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <ToolStep
        title={t("pdfTextEditor.inspector.document", "Document")}
        showNumber={false}
        isCollapsed={!open}
        onCollapsedClick={() => setOpen((v) => !v)}
        headerTestId="pdf-editor-document-toggle"
      >
        <FontsRow pages={pages} />
        <ViewSettings {...view} />
      </ToolStep>
      <AdvancedSettings
        groupingMode={groupingMode}
        widthMode={widthMode}
        onSetGroupingMode={onSetGroupingMode}
        onSetWidthMode={onSetWidthMode}
      />
    </Box>
  );
}

const FONT_STATUS_COLOR = {
  standard: "green",
  embedded: "blue",
  subset: "yellow",
} as const;

/**
 * Font coverage, collapsed to a single status row: one pill for the headline,
 * the per-font detail a click away. It only opens itself when a font is
 * actually missing glyphs.
 */
function FontsRow({ pages }: { pages: PageSnapshot[] }) {
  const { t } = useTranslation();
  // Pure: the font list AND coverage both come from snapshot data + the cmap
  // cache the loader primed during its serialized read.
  const fonts = analyzePageFonts(pages);
  const withGaps = fonts.filter(
    (f) => f.coverage.known && f.coverage.missing.length > 0,
  );
  const [open, setOpen] = useState(false);
  if (fonts.length === 0) return null;

  const allConfirmedFull =
    fonts.length > 0 &&
    fonts.every((f) => f.coverage.known && f.coverage.missing.length === 0);
  const tone = withGaps.length > 0 ? "warn" : allConfirmedFull ? "ok" : "info";
  const summary = {
    ok: {
      color: "green",
      label: t("pdfTextEditor.fonts.pill.ok", "All glyphs"),
      hint: t(
        "pdfTextEditor.fonts.compat.ok",
        "Every font includes the full alphabet and digits - type freely.",
      ),
    },
    info: {
      color: "blue",
      label: t("pdfTextEditor.fonts.pill.info", "Embedded"),
      hint: t(
        "pdfTextEditor.fonts.compat.info",
        "Existing text edits perfectly. A new character an embedded font doesn't include falls back to a standard font.",
      ),
    },
    warn: {
      color: "yellow",
      label: t("pdfTextEditor.fonts.pill.warn", "{{count}} with gaps", {
        count: withGaps.length,
      }),
      hint: t(
        "pdfTextEditor.fonts.compat.warnOther",
        "{{count}} fonts missing some letters or numbers - typing those uses a standard fallback font.",
        { count: withGaps.length },
      ),
    },
  }[tone];

  const expanded = open || tone === "warn";
  return (
    <div data-testid="pdf-editor-fonts-panel">
      <DisclosureRow
        open={expanded}
        onToggle={() => setOpen((v) => !v)}
        testId="pdf-editor-fonts-toggle"
        label={
          <Text size="sm">
            {t("pdfTextEditor.fonts.title", "Fonts")} · {fonts.length}
          </Text>
        }
        extra={
          <Tooltip
            label={summary.hint}
            multiline
            w={230}
            withArrow
            position="left"
          >
            <Badge
              size="xs"
              color={summary.color}
              variant="light"
              style={{ cursor: "help" }}
              data-testid="pdf-editor-font-compat"
              data-compat={tone}
            >
              {summary.label}
            </Badge>
          </Tooltip>
        }
      />
      <Collapse in={expanded}>
        <Stack gap="xs" mt="xs">
          {fonts.map((f) => (
            <FontRow key={f.key} font={f} />
          ))}
        </Stack>
      </Collapse>
    </div>
  );
}

/** Compact list of missing a-zA-Z0-9, e.g. "q W 7" (capped for width). */
function formatMissing(missing: string[]): string {
  const shown = missing.slice(0, 12).join(" ");
  return missing.length > 12 ? `${shown} +${missing.length - 12}` : shown;
}

function FontRow({ font }: { font: PageFont }) {
  const { t } = useTranslation();
  const { known, missing } = font.coverage;
  const hasGap = known && missing.length > 0;
  return (
    <Stack gap={2}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text
          size="xs"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={font.name}
        >
          {font.name}
        </Text>
        <Badge
          size="xs"
          color={FONT_STATUS_COLOR[font.status]}
          variant="light"
          style={{ flexShrink: 0 }}
          data-testid={`pdf-editor-font-${font.status}`}
        >
          {t(
            `pdfTextEditor.fonts.status.${font.status}.label`,
            font.status === "standard"
              ? "Standard"
              : font.status === "embedded"
                ? "Embedded"
                : "Subset",
          )}
        </Badge>
      </Group>
      {known &&
        (hasGap ? (
          <Text size="xs" c="yellow.8" data-testid="pdf-editor-font-missing">
            {t("pdfTextEditor.fonts.missing", "Missing: {{glyphs}}", {
              glyphs: formatMissing(missing),
            })}
          </Text>
        ) : (
          <Text size="xs" c="dimmed" data-testid="pdf-editor-font-full">
            {t(
              "pdfTextEditor.fonts.allPresent",
              "All letters & numbers present",
            )}
          </Text>
        ))}
    </Stack>
  );
}

import { useState } from "react";
import { Badge, Collapse, Group, Stack, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  Section,
  SectionLabel,
  StatRow,
} from "@app/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import {
  analyzePageFonts,
  type PageFont,
} from "@app/tools/pdfTextEditor/util/pageFonts";
import { DocumentSettings } from "@app/tools/pdfTextEditor/components/inspector/DocumentSettings";
import type {
  GroupingMode,
  PageSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/types";

interface Props {
  pages: PageSnapshot[];
  groupingMode: GroupingMode;
  widthMode: WidthMode;
  showRulers: boolean;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
  onSetShowRulers: (show: boolean) => void;
}

/** Facts about the open document. Nothing here acts on a selection. */
export function DocumentInspector({ pages, ...settings }: Props) {
  const { t } = useTranslation();
  const runs = pages.reduce((n, p) => n + p.runs.length, 0);
  const images = pages.reduce((n, p) => n + p.images.length, 0);
  return (
    <Stack gap={0} data-testid="pdf-editor-document-panel">
      <Section first>
        <SectionLabel>
          {t("pdfTextEditor.inspector.document", "Document")}
        </SectionLabel>
        <Stack gap={4}>
          <StatRow
            label={t("pdfTextEditor.inspector.pages", "Pages")}
            value={pages.length}
          />
          <StatRow
            label={t("pdfTextEditor.inspector.textBoxes", "Text boxes")}
            value={runs}
          />
          <StatRow
            label={t("pdfTextEditor.inspector.images", "Images")}
            value={images}
          />
        </Stack>
      </Section>
      <FontsSection pages={pages} />
      <DocumentSettings {...settings} />
    </Stack>
  );
}

const FONT_STATUS_COLOR = {
  standard: "green",
  embedded: "blue",
  subset: "yellow",
} as const;

/**
 * Font coverage, collapsed to a single status row.
 *
 * The old panel banner fired on every document to say nothing was wrong. Here
 * the headline is one pill; the per-font detail is one click away, and the row
 * only opens itself when a font is actually missing glyphs.
 */
function FontsSection({ pages }: { pages: PageSnapshot[] }) {
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
    <Section testId="pdf-editor-fonts-panel">
      <Button
        variant="tertiary"
        accent="neutral"
        size="sm"
        fullWidth
        justify="between"
        px="none"
        onClick={() => setOpen((v) => !v)}
        data-testid="pdf-editor-fonts-toggle"
        rightSection={
          expanded ? (
            <ExpandMoreIcon fontSize="small" />
          ) : (
            <ChevronRightIcon fontSize="small" />
          )
        }
      >
        <Group gap="xs" wrap="nowrap">
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: "0.5px" }}
          >
            {t("pdfTextEditor.fonts.title", "Fonts")} · {fonts.length}
          </Text>
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
        </Group>
      </Button>
      <Collapse in={expanded}>
        <Stack gap="xs" mt="xs">
          {fonts.map((f) => (
            <FontRow key={f.key} font={f} />
          ))}
        </Stack>
      </Collapse>
    </Section>
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

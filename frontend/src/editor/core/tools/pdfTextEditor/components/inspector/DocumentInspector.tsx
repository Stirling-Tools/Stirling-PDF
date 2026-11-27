import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  ColorPicker,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import ToolStep from "@editor/components/tools/shared/ToolStep";
import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import { useDocumentActions } from "@editor/tools/pdfTextEditor/hooks/useDocumentActions";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import { toCssHex } from "@editor/tools/pdfTextEditor/model/Color";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
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

/** Sets text in a family across the document: in one font, or with none, all of it. */
type ChangeFontEverywhere = (
  family: string,
  fontName: string | null,
) => Promise<FontPickFailure | null>;

interface Props {
  store: EditorStore;
  pages: PageSnapshot[];
  groupingMode: GroupingMode;
  widthMode: WidthMode;
  showRulers: boolean;
  onChangeFontEverywhere: ChangeFontEverywhere;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
  onSetShowRulers: (show: boolean) => void;
}

/**
 * The open document's fonts, colours and settings. Nothing here acts on the
 * selection: the changes sweep the whole document, which the selection's own
 * controls cannot. Laid out as the collapsible steps every other tool uses.
 */
export function DocumentInspector({
  store,
  pages,
  groupingMode,
  widthMode,
  onChangeFontEverywhere,
  onSetGroupingMode,
  onSetWidthMode,
  ...view
}: Props) {
  const { t } = useTranslation();
  const [documentOpen, setDocumentOpen] = useState(true);
  const [viewOpen, setViewOpen] = useState(true);
  const actions = useDocumentActions(store);
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
        isCollapsed={!documentOpen}
        onCollapsedClick={() => setDocumentOpen((v) => !v)}
        headerTestId="pdf-editor-document-toggle"
      >
        <FontsBlock pages={pages} onChange={onChangeFontEverywhere} />
        <ColoursBlock pages={pages} onRecolour={actions.recolour} />
        <LockedRow pages={pages} onUnlockAll={actions.unlockAll} />
      </ToolStep>
      <ToolStep
        title={t("pdfTextEditor.settings.view", "View")}
        showNumber={false}
        isCollapsed={!viewOpen}
        onCollapsedClick={() => setViewOpen((v) => !v)}
        headerTestId="pdf-editor-view-toggle"
      >
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

/** A block's heading, with its document-wide control at the end of the row. */
function BlockHeading({
  children,
  extra,
  action,
}: {
  children: ReactNode;
  extra?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={500}>
          {children}
        </Text>
        {extra}
      </Group>
      {action}
    </Group>
  );
}

/** Every font in use, each with its coverage and a way to swap it out everywhere. */
function FontsBlock({
  pages,
  onChange,
}: {
  pages: PageSnapshot[];
  onChange: ChangeFontEverywhere;
}) {
  const { t } = useTranslation();
  // Pure: the font list AND coverage both come from snapshot data + the cmap
  // cache the loader primed during its serialized read.
  const fonts = analyzePageFonts(pages);
  const runs = pages.flatMap((p) => p.runs);
  if (fonts.length === 0) return null;
  return (
    <Stack gap="xs" data-testid="pdf-editor-fonts-panel">
      <BlockHeading
        extra={<CoveragePill fonts={fonts} />}
        action={
          <FontChoice
            label={t("pdfTextEditor.document.changeAll", "Change all")}
            heading={t("pdfTextEditor.document.allFontsTo", "Set all text in")}
            testId="pdf-editor-all-fonts"
            onPick={(family) => onChange(family, null)}
          />
        }
      >
        {t("pdfTextEditor.fonts.title", "Fonts")}
      </BlockHeading>
      {fonts.map((font) => (
        <FontRow
          key={font.key}
          font={font}
          uses={runs.filter((r) => r.fontId.endsWith(font.name)).length}
          onReplace={(family) => onChange(family, font.name)}
        />
      ))}
    </Stack>
  );
}

/** One pill for how well the fonts cover new typing, its detail on hover. */
function CoveragePill({ fonts }: { fonts: PageFont[] }) {
  const { t } = useTranslation();
  const withGaps = fonts.filter(
    (f) => f.coverage.known && f.coverage.missing.length > 0,
  );
  const allConfirmedFull = fonts.every(
    (f) => f.coverage.known && f.coverage.missing.length === 0,
  );
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
  return (
    <Tooltip label={summary.hint} multiline w={230} withArrow position="left">
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
  );
}

const FONT_STATUS_LABEL: Record<PageFont["status"], string> = {
  standard: "Standard",
  embedded: "Embedded",
  subset: "Subset",
};

/** Compact list of missing a-zA-Z0-9, e.g. "q W 7" (capped for width). */
function formatMissing(missing: string[]): string {
  const shown = missing.slice(0, 12).join(" ");
  return missing.length > 12 ? `${shown} +${missing.length - 12}` : shown;
}

function FontRow({
  font,
  uses,
  onReplace,
}: {
  font: PageFont;
  uses: number;
  onReplace: (family: string) => Promise<FontPickFailure | null>;
}) {
  const { t } = useTranslation();
  const { known, missing } = font.coverage;
  const hasGap = known && missing.length > 0;
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text
          size="sm"
          title={font.name}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {/* A font the PDF gives no readable name reads as "Unknown". */}
          {font.name === "Unknown"
            ? t("pdfTextEditor.document.unnamedFont", "Embedded font")
            : font.name}
        </Text>
        <Text size="xs" c="dimmed">
          <span data-testid={`pdf-editor-font-${font.status}`}>
            {t(
              `pdfTextEditor.fonts.status.${font.status}.label`,
              FONT_STATUS_LABEL[font.status],
            )}
          </span>
          {" · "}
          {t("pdfTextEditor.document.uses", {
            defaultValue_one: "{{count}} text box",
            defaultValue_other: "{{count}} text boxes",
            count: uses,
          })}
        </Text>
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
      <FontChoice
        label={t("pdfTextEditor.document.replace", "Replace")}
        heading={t(
          "pdfTextEditor.document.replaceWith",
          "Replace everywhere with",
        )}
        testId={`pdf-editor-replace-font-${font.key}`}
        onPick={onReplace}
      />
    </Group>
  );
}

/** A small button opening the editor's own font picker for a document-wide change. */
function FontChoice({
  label,
  heading,
  testId,
  onPick,
}: {
  label: string;
  heading: string;
  testId: string;
  onPick: (family: string) => Promise<FontPickFailure | null>;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      withinPortal
      trapFocus
    >
      <Popover.Target>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          rightSection={<Icon name="chevron-down" size={14} />}
          onClick={() => setOpened((o) => !o)}
          data-testid={testId}
          style={{ flexShrink: 0 }}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" fw={500}>
            {heading}
          </Text>
          <FontFamilySelect
            value={null}
            // Inside the popover, so picking from its list does not count as a click outside.
            withinPortal={false}
            onChange={async (family) => {
              const failure = await onPick(family);
              if (!failure) setOpened(false);
              return failure;
            }}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** The most-used colours shown as swatches; more than this reads as noise. */
const MAX_SWATCHES = 12;

/** Every text colour in use, each swatch recolouring only the text in it. */
function ColoursBlock({
  pages,
  onRecolour,
}: {
  pages: PageSnapshot[];
  onRecolour: (fromHex: string | null, toHex: string) => void;
}) {
  const { t } = useTranslation();
  const colours = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of pages.flatMap((p) => p.runs)) {
      const hex = toCssHex(run.fill).toLowerCase();
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SWATCHES);
  }, [pages]);
  if (colours.length === 0) return null;
  return (
    <Stack gap="xs" data-testid="pdf-editor-document-colours">
      <BlockHeading
        action={
          <ColourPicking
            initial={colours[0][0]}
            onChange={(next) => onRecolour(null, next)}
            trigger={(toggle) => (
              <Button
                size="sm"
                variant="tertiary"
                accent="neutral"
                rightSection={<Icon name="chevron-down" size={14} />}
                onClick={toggle}
                data-testid="pdf-editor-all-colours"
                style={{ flexShrink: 0 }}
              >
                {t("pdfTextEditor.document.changeAll", "Change all")}
              </Button>
            )}
          />
        }
      >
        {t("pdfTextEditor.document.colours", "Text colours")}
      </BlockHeading>
      <Group gap={8}>
        {colours.map(([hex, count]) => (
          <ColourSwatch
            key={hex}
            hex={hex}
            count={count}
            onChange={(next) => onRecolour(hex, next)}
          />
        ))}
      </Group>
    </Stack>
  );
}

/** A colour picker behind any trigger: one change when the pick lands, none while dragging. */
function ColourPicking({
  initial,
  onChange,
  trigger,
}: {
  initial: string;
  onChange: (next: string) => void;
  trigger: (toggle: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      withinPortal
      trapFocus
    >
      <Popover.Target>
        <span style={{ display: "inline-flex", flexShrink: 0 }}>
          {trigger(() => setOpened((o) => !o))}
        </span>
      </Popover.Target>
      <Popover.Dropdown>
        <ColorPicker
          format="hex"
          size="sm"
          saturationLabel={t(
            "colorPicker.saturation",
            "Saturation and brightness",
          )}
          hueLabel={t("colorPicker.hue", "Hue")}
          defaultValue={initial}
          onChangeEnd={(next) => {
            setOpened(false);
            if (next.toLowerCase() !== initial.toLowerCase()) onChange(next);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function ColourSwatch({
  hex,
  count,
  onChange,
}: {
  hex: string;
  count: number;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.document.colourUses", {
    defaultValue_one: "{{hex}} · {{count}} text box",
    defaultValue_other: "{{hex}} · {{count}} text boxes",
    hex: hex.toUpperCase(),
    count,
  });
  return (
    <ColourPicking
      initial={hex}
      onChange={onChange}
      trigger={(toggle) => (
        <Tooltip label={label} withArrow>
          <button
            type="button"
            aria-label={label}
            onClick={toggle}
            data-testid={`pdf-editor-colour-${hex.slice(1)}`}
            style={{
              width: "1.5rem",
              height: "1.5rem",
              padding: 0,
              borderRadius: "50%",
              background: hex,
              border: "0.0625rem solid var(--c-border-strong)",
              cursor: "pointer",
            }}
          />
        </Tooltip>
      )}
    />
  );
}

/** How many items are locked, and a way to free them all. Absent when none are. */
function LockedRow({
  pages,
  onUnlockAll,
}: {
  pages: PageSnapshot[];
  onUnlockAll: () => void;
}) {
  const { t } = useTranslation();
  const locked =
    pages.flatMap((p) => p.runs).filter((r) => r.locked).length +
    pages.flatMap((p) => p.images).filter((i) => i.locked).length;
  if (locked === 0) return null;
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      gap="sm"
      data-testid="pdf-editor-document-locked"
    >
      <Group gap={8} wrap="nowrap">
        <Icon name="lock" size={16} style={{ color: "var(--c-text-muted)" }} />
        <Text size="sm">
          {t("pdfTextEditor.document.locked", {
            defaultValue: "{{count}} locked",
            count: locked,
          })}
        </Text>
      </Group>
      <Button
        size="sm"
        variant="secondary"
        accent="neutral"
        onClick={onUnlockAll}
        data-testid="pdf-editor-unlock-all"
      >
        {t("pdfTextEditor.document.unlockAll", "Unlock all")}
      </Button>
    </Group>
  );
}

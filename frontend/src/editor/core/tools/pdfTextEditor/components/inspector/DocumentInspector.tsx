import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  ColorPicker,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon, type IconName } from "@editor/ui/Icon";
import ToolStep from "@editor/components/tools/shared/ToolStep";
import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import { useDocumentActions } from "@editor/tools/pdfTextEditor/hooks/useDocumentActions";
import { useLivePreview } from "@editor/tools/pdfTextEditor/hooks/useLivePreview";
import type {
  DocumentFontStyle,
  FontPickFailure,
} from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
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
  style: DocumentFontStyle,
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
        <FontsBlock
          store={store}
          pages={pages}
          onChange={onChangeFontEverywhere}
        />
        <ColoursBlock
          store={store}
          pages={pages}
          onRecolour={actions.recolour}
        />
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

/** One icon button for every document-wide change, named by its tooltip. */
function ChangeButton({
  icon = "pencil",
  label,
  onClick,
  testId,
}: {
  icon?: IconName;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        size="sm"
        variant="secondary"
        accent="neutral"
        onClick={onClick}
        aria-label={label}
        data-testid={testId}
        style={{ flexShrink: 0 }}
      >
        <Icon name={icon} size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** About four fonts; more scroll inside the list, so the panel itself never has to. */
const FONT_LIST_MAX_HEIGHT = "12rem";

/** Thin enough to fit in the panel's side margin. */
const FONT_LIST_SCROLLBAR = 6;

/** A font whose swap is being picked: one of the document's, or with no name, all of them. */
interface FontTarget {
  fontName: string | null;
  label: string;
}

/**
 * Every font in use, each with a way to swap it out everywhere. Closed by
 * default behind one row: a long list would otherwise push the panel past
 * its height.
 */
function FontsBlock({
  store,
  pages,
  onChange,
}: {
  store: EditorStore;
  pages: PageSnapshot[];
  onChange: ChangeFontEverywhere;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<FontTarget | null>(null);
  // Pure: the font list AND coverage both come from snapshot data + the cmap
  // cache the loader primed during its serialized read.
  const fonts = analyzePageFonts(pages);
  const runs = pages.flatMap((p) => p.runs);
  if (fonts.length === 0) return null;
  return (
    <Stack gap="xs" data-testid="pdf-editor-fonts-panel">
      <ChangePopover
        opened={target !== null}
        // The Fonts row, not the row of the font being replaced, which goes
        // from the list as soon as its text previews in another font.
        anchor={
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              data-testid="pdf-editor-fonts-toggle"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--mantine-spacing-xs)",
                width: "100%",
                minWidth: 0,
                padding: 0,
                border: "none",
                background: "none",
                color: "inherit",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              <Icon
                name="chevron-right"
                size={16}
                style={{
                  flexShrink: 0,
                  color: "var(--c-text-muted)",
                  transform: open ? "rotate(90deg)" : undefined,
                  transition: "transform 150ms ease",
                }}
              />
              <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                {t("pdfTextEditor.fonts.title", "Fonts")} · {fonts.length}
              </Text>
              <CoveragePill fonts={fonts} />
            </button>
            <ChangeButton
              label={t(
                "pdfTextEditor.document.changeAllFonts",
                "Change all fonts",
              )}
              onClick={() =>
                setTarget({
                  fontName: null,
                  label: t("pdfTextEditor.document.allText", "All text"),
                })
              }
              testId="pdf-editor-all-fonts"
            />
          </Group>
        }
      >
        {target && (
          <FontChangePanel
            store={store}
            target={target}
            onApply={(family, style) =>
              onChange(family, target.fontName, style)
            }
            onDone={() => setTarget(null)}
          />
        )}
      </ChangePopover>
      {open && (
        <ScrollArea.Autosize
          mah={FONT_LIST_MAX_HEIGHT}
          type="auto"
          offsetScrollbars
          scrollbarSize={FONT_LIST_SCROLLBAR}
          // The scrollbar sits in the panel's margin, so the rows keep the
          // heading's width and their buttons line up under its button.
          style={{ marginRight: -FONT_LIST_SCROLLBAR }}
        >
          <Stack role="list" gap="sm">
            {fonts.map((font) => (
              <FontRow
                key={font.key}
                font={font}
                uses={runs.filter((r) => r.fontId.endsWith(font.name)).length}
                onReplace={(label) => setTarget({ fontName: font.name, label })}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
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
        "You can type any letter or number in these fonts.",
      ),
    },
    info: {
      color: "blue",
      label: t("pdfTextEditor.fonts.pill.info", "Embedded"),
      hint: t(
        "pdfTextEditor.fonts.compat.info",
        "New letters you type may look slightly different.",
      ),
    },
    warn: {
      color: "yellow",
      label: t("pdfTextEditor.fonts.pill.warn", "{{count}} with gaps", {
        count: withGaps.length,
      }),
      hint: t(
        "pdfTextEditor.fonts.compat.warnOther",
        "Some fonts are missing letters. Those will look slightly different when typed.",
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

const FONT_STATUS: Record<
  PageFont["status"],
  { label: string; hint: string; color: string }
> = {
  standard: {
    label: "Standard",
    hint: "A common font. Anything you type will match.",
    color: "green",
  },
  embedded: {
    label: "Embedded",
    hint: "Included in this PDF. Anything you type will match.",
    color: "blue",
  },
  subset: {
    label: "Subset",
    hint: "Only part of this font is included. Some letters you type may look different.",
    color: "yellow",
  },
};

/** Compact list of missing a-zA-Z0-9, e.g. "q W 7" (capped for width). */
function formatMissing(missing: string[]): string {
  const shown = missing.slice(0, 12).join(" ");
  return missing.length > 12 ? `${shown} +${missing.length - 12}` : shown;
}

/** 1234 as "1.2K": a font used across a long document still fits its row. */
function compactCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: "compact" }).format(count);
}

function FontRow({
  font,
  uses,
  onReplace,
}: {
  font: PageFont;
  uses: number;
  onReplace: (label: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { known, missing } = font.coverage;
  // A font the PDF gives no readable name reads as "Unknown".
  const name =
    font.name === "Unknown"
      ? t("pdfTextEditor.document.unnamedFont", "Embedded font")
      : font.name;
  return (
    <Group role="listitem" justify="space-between" wrap="nowrap" gap="sm">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Tooltip label={name} withArrow position="top-start">
          <Text
            size="sm"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </Text>
        </Tooltip>
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <FontStatusTag font={font} name={name} />
          <Text
            size="xs"
            c="dimmed"
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t("pdfTextEditor.document.usedTimes", {
              defaultValue_one: "Used once",
              defaultValue_other: "Used {{uses}} times",
              count: uses,
              uses: compactCount(uses, i18n.language),
            })}
          </Text>
        </Group>
        {known && missing.length > 0 && (
          <Text size="xs" c="yellow.8" data-testid="pdf-editor-font-missing">
            {t("pdfTextEditor.fonts.missing", "Missing: {{glyphs}}", {
              glyphs: formatMissing(missing),
            })}
          </Text>
        )}
      </Stack>
      <ChangeButton
        label={t("pdfTextEditor.document.replaceFont", "Replace this font")}
        onClick={() => onReplace(name)}
        testId={`pdf-editor-replace-font-${font.key}`}
      />
    </Group>
  );
}

/** The font's status as a tag, with everything known about the font on hover. */
function FontStatusTag({ font, name }: { font: PageFont; name: string }) {
  const { t } = useTranslation();
  const status = FONT_STATUS[font.status];
  const { known, missing } = font.coverage;
  const coverage = !known
    ? t(
        "pdfTextEditor.fonts.coverageUnknown",
        "Couldn't check which letters it has.",
      )
    : missing.length > 0
      ? t("pdfTextEditor.fonts.missing", "Missing: {{glyphs}}", {
          glyphs: formatMissing(missing),
        })
      : t("pdfTextEditor.fonts.allPresent", "Has every letter and number.");
  return (
    <Tooltip
      multiline
      w={240}
      withArrow
      position="left"
      label={
        <Stack gap={4}>
          <Text size="xs" fw={600}>
            {name}
          </Text>
          <Text size="xs">
            {t(`pdfTextEditor.fonts.status.${font.status}.hint`, status.hint)}
          </Text>
          <Text size="xs">{coverage}</Text>
        </Stack>
      }
    >
      <Badge
        size="xs"
        color={status.color}
        variant="light"
        style={{ cursor: "help", flexShrink: 0 }}
        data-testid={`pdf-editor-font-${font.status}`}
      >
        {t(`pdfTextEditor.fonts.status.${font.status}.label`, status.label)}
      </Badge>
    </Tooltip>
  );
}

/**
 * A change picked over the panel: opens below its block's heading and covers
 * the panel rather than the page, so the page shows the change as it is tried.
 */
function ChangePopover({
  opened,
  anchor,
  children,
}: {
  opened: boolean;
  anchor: ReactNode;
  children: ReactNode;
}) {
  return (
    <Popover
      opened={opened}
      position="bottom"
      width="target"
      shadow="md"
      withinPortal
      trapFocus
      // Done and Cancel close it, each saying what happens to the preview.
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Popover.Target>
        <div>{anchor}</div>
      </Popover.Target>
      <Popover.Dropdown>{children}</Popover.Dropdown>
    </Popover>
  );
}

/** Cancel puts the document back; Done keeps what the page now shows. */
function PreviewFooter({
  onCancel,
  onDone,
  canKeep,
  testIdPrefix,
}: {
  onCancel: () => void;
  onDone: () => void;
  canKeep: boolean;
  testIdPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" justify="flex-end">
      <Button
        size="sm"
        variant="secondary"
        accent="neutral"
        onClick={onCancel}
        data-testid={`${testIdPrefix}-cancel`}
      >
        {t("cancel", "Cancel")}
      </Button>
      <Button
        size="sm"
        onClick={onDone}
        disabled={!canKeep}
        data-testid={`${testIdPrefix}-done`}
      >
        {t("pdfTextEditor.document.done", "Done")}
      </Button>
    </Group>
  );
}

/**
 * Picks a family for a font's text, the page showing each pick as it is made.
 * The simple path is just the font: each text keeps its own bold and italic.
 * Bold and Italic make all of it bold or italic, and unticking "keep" sets
 * every text to exactly what is pressed.
 */
function FontChangePanel({
  store,
  target,
  onApply,
  onDone,
}: {
  store: EditorStore;
  target: FontTarget;
  onApply: (
    family: string,
    style: DocumentFontStyle,
  ) => Promise<FontPickFailure | null>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const live = useLivePreview(store);
  const [family, setFamily] = useState<string | null>(null);
  const [style, setStyle] = useState<DocumentFontStyle>({
    keep: true,
    bold: false,
    italic: false,
  });
  const tryOut = (nextFamily: string | null, nextStyle: DocumentFontStyle) => {
    setFamily(nextFamily);
    setStyle(nextStyle);
    // Bold and italic are faces of a font, so they wait for one to be picked.
    return nextFamily
      ? live.preview(() => onApply(nextFamily, nextStyle))
      : Promise.resolve(null);
  };
  const toggle = (key: "bold" | "italic", icon: IconName, label: string) => (
    <Tooltip label={label} withArrow>
      <Button
        size="sm"
        variant={style[key] ? "primary" : "secondary"}
        accent={style[key] ? "default" : "neutral"}
        aria-label={label}
        aria-pressed={style[key]}
        onClick={() => void tryOut(family, { ...style, [key]: !style[key] })}
        data-testid={`pdf-editor-font-change-${key}`}
        leftSection={<Icon name={icon} size={18} />}
      />
    </Tooltip>
  );
  return (
    <Stack gap="sm" data-testid="pdf-editor-font-change-panel">
      <div>
        <Text size="sm" fw={500}>
          {t("pdfTextEditor.document.changeFont", "Change font")}
        </Text>
        <Text size="xs" c="dimmed">
          {target.label}
        </Text>
      </div>
      <Text size="xs" c="dimmed">
        {target.fontName === null
          ? t(
              "pdfTextEditor.document.changeAllFontsHint",
              "All text in the document will change to the font you pick. Locked text stays the same.",
            )
          : t(
              "pdfTextEditor.document.changeFontHint",
              "All text in this font will change. Locked text stays the same.",
            )}
      </Text>
      <Group gap="xs" wrap="nowrap">
        <FontFamilySelect
          value={family}
          // Inside the popover, so picking from its list is not a click outside it.
          withinPortal={false}
          onChange={(next) => tryOut(next, style)}
        />
        {toggle(
          "bold",
          "bold",
          t("pdfTextEditor.document.makeBold", "Make it all bold"),
        )}
        {toggle(
          "italic",
          "italic",
          t("pdfTextEditor.document.makeItalic", "Make it all italic"),
        )}
      </Group>
      <Checkbox
        checked={style.keep}
        onChange={(e) =>
          void tryOut(family, { ...style, keep: e.currentTarget.checked })
        }
        label={t(
          "pdfTextEditor.document.keepStyle",
          "Keep bold and italic text as it is",
        )}
        data-testid="pdf-editor-font-change-keep"
      />
      <PreviewFooter
        canKeep={family !== null}
        testIdPrefix="pdf-editor-font-change"
        onCancel={() => {
          live.cancel();
          onDone();
        }}
        onDone={() => {
          live.keep();
          onDone();
        }}
      />
    </Stack>
  );
}

/** Swatches that fit one row beside the "+N" chip in the narrowest panel. */
const ROW_SWATCHES = 6;

/** A colour whose change is being picked: one in use, or with no hex, all text. */
interface ColourTarget {
  fromHex: string | null;
  initial: string;
  label: string;
}

/** Every text colour in use, each swatch recolouring only the text in it. */
function ColoursBlock({
  store,
  pages,
  onRecolour,
}: {
  store: EditorStore;
  pages: PageSnapshot[];
  onRecolour: (fromHex: string | null, toHex: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<ColourTarget | null>(null);
  const colours = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of pages.flatMap((p) => p.runs)) {
      const hex = toCssHex(run.fill).toLowerCase();
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [pages]);
  if (colours.length === 0) return null;
  // One row however many colours there are: the most used, then the rest
  // behind a chip, so a document in hundreds of colours cannot spill.
  const shown =
    colours.length > ROW_SWATCHES + 1
      ? colours.slice(0, ROW_SWATCHES)
      : colours;
  const rest = colours.slice(shown.length);
  const pick = (hex: string, label: string) =>
    setTarget({ fromHex: hex, initial: hex, label });
  return (
    <Stack gap="xs" data-testid="pdf-editor-document-colours">
      <ChangePopover
        opened={target !== null}
        // The heading, not the swatch, which goes as its colour previews.
        anchor={
          <BlockHeading
            action={
              <ChangeButton
                label={t(
                  "pdfTextEditor.document.changeAllColours",
                  "Change all colours",
                )}
                onClick={() =>
                  setTarget({
                    fromHex: null,
                    initial: colours[0][0],
                    label: t("pdfTextEditor.document.allText", "All text"),
                  })
                }
                testId="pdf-editor-all-colours"
              />
            }
          >
            {t("pdfTextEditor.document.colours", "Text colours")}
          </BlockHeading>
        }
      >
        {target && (
          <ColourChangePanel
            store={store}
            target={target}
            onApply={(next) => onRecolour(target.fromHex, next)}
            onDone={() => setTarget(null)}
          />
        )}
      </ChangePopover>
      <Group gap={8} wrap="nowrap">
        {shown.map(([hex, count]) => (
          <ColourSwatch
            key={hex}
            hex={hex}
            count={count}
            onPick={(label) => pick(hex, label)}
          />
        ))}
        {rest.length > 0 && <MoreColours colours={rest} onPick={pick} />}
      </Group>
    </Stack>
  );
}

/** The colours that did not fit the row, behind a "+N" chip. */
function MoreColours({
  colours,
  onPick,
}: {
  colours: [string, number][];
  onPick: (hex: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const label = t("pdfTextEditor.document.moreColours", {
    defaultValue: "{{count}} more colours",
    count: colours.length,
  });
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
          onClick={() => setOpened((o) => !o)}
          aria-label={label}
          title={label}
          data-testid="pdf-editor-more-colours"
          style={{ flexShrink: 0, borderRadius: "999px" }}
        >
          +{colours.length}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <ScrollArea.Autosize mah="12rem" type="auto" offsetScrollbars>
          <Group gap={8} w={232} data-testid="pdf-editor-more-colours-list">
            {colours.map(([hex, count]) => (
              <ColourSwatch
                key={hex}
                hex={hex}
                count={count}
                onPick={(swatchLabel) => {
                  setOpened(false);
                  onPick(hex, swatchLabel);
                }}
              />
            ))}
          </Group>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

function ColourSwatch({
  hex,
  count,
  onPick,
}: {
  hex: string;
  count: number;
  onPick: (label: string) => void;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.document.colourUses", {
    defaultValue_one: "{{hex}} · {{count}} text box",
    defaultValue_other: "{{hex}} · {{count}} text boxes",
    hex: hex.toUpperCase(),
    count,
  });
  return (
    <Tooltip label={label} withArrow>
      <button
        type="button"
        aria-label={label}
        onClick={() => onPick(label)}
        data-testid={`pdf-editor-colour-${hex.slice(1)}`}
        style={{
          width: "1.5rem",
          height: "1.5rem",
          flexShrink: 0,
          padding: 0,
          borderRadius: "50%",
          background: hex,
          border: "0.0625rem solid var(--c-border-strong)",
          cursor: "pointer",
        }}
      />
    </Tooltip>
  );
}

/** Picks a new colour for a colour's text, the page showing it as each pick lands. */
function ColourChangePanel({
  store,
  target,
  onApply,
  onDone,
}: {
  store: EditorStore;
  target: ColourTarget;
  onApply: (next: string) => Promise<void>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const live = useLivePreview(store);
  const [value, setValue] = useState(target.initial);
  const [tried, setTried] = useState(false);
  return (
    <Stack gap="sm" data-testid="pdf-editor-colour-change-panel">
      <div>
        <Text size="sm" fw={500}>
          {t("pdfTextEditor.document.changeColour", "Change colour")}
        </Text>
        <Text size="xs" c="dimmed">
          {target.label}
        </Text>
      </div>
      <ColorPicker
        format="hex"
        fullWidth
        size="sm"
        saturationLabel={t(
          "colorPicker.saturation",
          "Saturation and brightness",
        )}
        hueLabel={t("colorPicker.hue", "Hue")}
        value={value}
        onChange={setValue}
        // Once per drag, not per frame: each preview redraws every page.
        onChangeEnd={(next) => {
          setTried(true);
          void live.preview(() => onApply(next));
        }}
      />
      <Group gap="xs">
        <span
          aria-hidden
          style={{
            width: "1.25rem",
            height: "1.25rem",
            borderRadius: "50%",
            background: value,
            border: "0.0625rem solid var(--c-border-strong)",
          }}
        />
        <Text size="sm" ff="monospace">
          {value.toUpperCase()}
        </Text>
      </Group>
      <PreviewFooter
        canKeep={tried}
        testIdPrefix="pdf-editor-colour-change"
        onCancel={() => {
          live.cancel();
          onDone();
        }}
        onDone={() => {
          live.keep();
          onDone();
        }}
      />
    </Stack>
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
      <ChangeButton
        icon="lock-open"
        label={t("pdfTextEditor.document.unlockAll", "Unlock all")}
        onClick={onUnlockAll}
        testId="pdf-editor-unlock-all"
      />
    </Group>
  );
}

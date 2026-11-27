import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  ColorPicker,
  Group,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Modal } from "@editor/ui/Modal";
import ToolStep from "@editor/components/tools/shared/ToolStep";
import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import { useFontChangeWarning } from "@editor/tools/pdfTextEditor/components/fontPickFailure";
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

/** A secondary button for a document-wide change. */
function ChangeButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      accent="neutral"
      onClick={onClick}
      data-testid={testId}
      style={{ flexShrink: 0, alignSelf: "flex-start" }}
    >
      {children}
    </Button>
  );
}

/** About four fonts; more scroll inside the list, so the panel itself never has to. */
const FONT_LIST_MAX_HEIGHT = "12rem";

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
  pages,
  onChange,
}: {
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
      {open && (
        <ChangeButton
          onClick={() =>
            setTarget({
              fontName: null,
              label: t("pdfTextEditor.document.allText", "All text"),
            })
          }
          testId="pdf-editor-all-fonts"
        >
          {t("pdfTextEditor.document.changeAll", "Change all")}
        </ChangeButton>
      )}
      {open && (
        <ScrollArea.Autosize
          mah={FONT_LIST_MAX_HEIGHT}
          type="auto"
          offsetScrollbars
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
      <FontChangeModal
        target={target}
        onClose={() => setTarget(null)}
        onApply={(family) => onChange(family, target?.fontName ?? null)}
      />
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

function FontRow({
  font,
  uses,
  onReplace,
}: {
  font: PageFont;
  uses: number;
  onReplace: (label: string) => void;
}) {
  const { t } = useTranslation();
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
        <Group gap={6} wrap="nowrap">
          <FontStatusTag font={font} name={name} />
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            {t("pdfTextEditor.document.usedTimes", {
              defaultValue_one: "Used once",
              defaultValue_other: "Used {{count}} times",
              count: uses,
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
        onClick={() => onReplace(name)}
        testId={`pdf-editor-replace-font-${font.key}`}
      >
        {t("pdfTextEditor.document.replace", "Replace")}
      </ChangeButton>
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

/** Picks a family for a font's text, applying only once the user confirms. */
function FontChangeModal({
  target,
  onClose,
  onApply,
}: {
  target: FontTarget | null;
  onClose: () => void;
  onApply: (family: string) => Promise<FontPickFailure | null>;
}) {
  const { t } = useTranslation();
  const warnAbout = useFontChangeWarning();
  const [family, setFamily] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const close = () => {
    setFamily(null);
    onClose();
  };
  const apply = async () => {
    if (!family) return;
    setApplying(true);
    try {
      await warnAbout(() => onApply(family));
    } finally {
      setApplying(false);
    }
    close();
  };
  return (
    <Modal
      open={target !== null}
      onClose={close}
      width="sm"
      title={t("pdfTextEditor.document.changeFont", "Change font")}
      subtitle={target?.label}
      footer={
        <Group gap="xs" justify="flex-end">
          <Button variant="secondary" accent="neutral" onClick={close}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => void apply()}
            disabled={!family}
            loading={applying}
            data-testid="pdf-editor-font-change-apply"
          >
            {t("pdfTextEditor.document.apply", "Apply")}
          </Button>
        </Group>
      }
    >
      <Stack gap="sm" data-testid="pdf-editor-font-change-modal">
        <Text size="sm" c="dimmed">
          {t(
            "pdfTextEditor.document.changeFontHint",
            "All text in this font will change. Locked text stays the same.",
          )}
        </Text>
        <FontFamilySelect
          value={family}
          // Inside the modal, so picking from its list is not a click outside it.
          withinPortal={false}
          onChange={(next) => setFamily(next)}
        />
      </Stack>
    </Modal>
  );
}

/** The most-used colours shown as swatches; more than this reads as noise. */
const MAX_SWATCHES = 12;

/** A colour whose change is being picked: one in use, or with no hex, all text. */
interface ColourTarget {
  fromHex: string | null;
  initial: string;
  label: string;
}

/** Every text colour in use, each swatch recolouring only the text in it. */
function ColoursBlock({
  pages,
  onRecolour,
}: {
  pages: PageSnapshot[];
  onRecolour: (fromHex: string | null, toHex: string) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<ColourTarget | null>(null);
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
          <ChangeButton
            onClick={() =>
              setTarget({
                fromHex: null,
                initial: colours[0][0],
                label: t("pdfTextEditor.document.allText", "All text"),
              })
            }
            testId="pdf-editor-all-colours"
          >
            {t("pdfTextEditor.document.changeAll", "Change all")}
          </ChangeButton>
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
            onPick={(label) => setTarget({ fromHex: hex, initial: hex, label })}
          />
        ))}
      </Group>
      <ColourChangeModal
        target={target}
        onClose={() => setTarget(null)}
        onApply={(next) => onRecolour(target?.fromHex ?? null, next)}
      />
    </Stack>
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

/** Picks a new colour for a colour's text, applying only once the user confirms. */
function ColourChangeModal({
  target,
  onClose,
  onApply,
}: {
  target: ColourTarget | null;
  onClose: () => void;
  onApply: (next: string) => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? target?.initial ?? "#000000";
  const close = () => {
    setPicked(null);
    onClose();
  };
  const unchanged =
    !picked || picked.toLowerCase() === target?.initial.toLowerCase();
  return (
    <Modal
      open={target !== null}
      onClose={close}
      width="sm"
      title={t("pdfTextEditor.document.changeColour", "Change colour")}
      subtitle={target?.label}
      footer={
        <Group gap="xs" justify="flex-end">
          <Button variant="secondary" accent="neutral" onClick={close}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => {
              onApply(value);
              close();
            }}
            disabled={unchanged}
            data-testid="pdf-editor-colour-change-apply"
          >
            {t("pdfTextEditor.document.apply", "Apply")}
          </Button>
        </Group>
      }
    >
      <Stack gap="sm" data-testid="pdf-editor-colour-change-modal">
        <ColorPicker
          format="hex"
          fullWidth
          saturationLabel={t(
            "colorPicker.saturation",
            "Saturation and brightness",
          )}
          hueLabel={t("colorPicker.hue", "Hue")}
          value={value}
          onChange={setPicked}
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
      </Stack>
    </Modal>
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
      <ChangeButton onClick={onUnlockAll} testId="pdf-editor-unlock-all">
        {t("pdfTextEditor.document.unlockAll", "Unlock all")}
      </ChangeButton>
    </Group>
  );
}

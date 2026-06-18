import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  HoverCard,
  Kbd,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import TextFieldsIcon from "@mui/icons-material/TextFieldsOutlined";
import ImageIcon from "@mui/icons-material/ImageOutlined";
import CallMergeIcon from "@mui/icons-material/CallMergeOutlined";
import CallSplitIcon from "@mui/icons-material/CallSplitOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningIcon from "@mui/icons-material/WarningAmberOutlined";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import type {
  EditorViewState,
  LoadProgress,
} from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type {
  GroupingMode,
  PageSnapshot,
  SelectionState,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";
import {
  analyzePageFonts,
  type FontStatusV2,
  type PageFont,
} from "@app/tools/pdfTextEditor/v2/util/pageFonts";

/**
 * Sidebar for the v2 text/image editor.
 *
 * Scope: the general (non-selection) editor tools - insert (add text /
 * image), paragraph grouping (group / ungroup), and the editor settings
 * (text grouping, text-box width) - plus a compact selection status and
 * the Ctrl+drag move tip. The per-selection formatting controls live in
 * the toolbar above; document-level page operations live in Stirling's
 * dedicated page tools.
 */
interface SidebarProps {
  state: EditorViewState;
  selection: SelectionState;
  mode: "select" | "addText";
  canGroup: boolean;
  canUngroup: boolean;
  onToggleAddText: () => void;
  onPickImage: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
}

export function EditorSidebar({
  state,
  selection,
  mode,
  canGroup,
  canUngroup,
  onToggleAddText,
  onPickImage,
  onGroup,
  onUngroup,
  onSetGroupingMode,
  onSetWidthMode,
}: SidebarProps) {
  return (
    <Box p="md" style={{ flex: 1, overflow: "auto" }}>
      {state.hasDocument ? (
        <LoadedSidebar
          state={state}
          selection={selection}
          mode={mode}
          canGroup={canGroup}
          canUngroup={canUngroup}
          onToggleAddText={onToggleAddText}
          onPickImage={onPickImage}
          onGroup={onGroup}
          onUngroup={onUngroup}
          onSetGroupingMode={onSetGroupingMode}
          onSetWidthMode={onSetWidthMode}
        />
      ) : (
        <EmptySidebar progress={state.progress} loading={state.loading} />
      )}
    </Box>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: "0.4px" }}>
      {children}
    </Text>
  );
}

const FONT_STATUS_META: Record<
  FontStatusV2,
  { color: string; label: string; hint: string }
> = {
  standard: {
    color: "green",
    label: "Standard",
    hint: "Standard PDF font (Helvetica / Times / Courier family). The full standard character set is always available, so existing text AND new characters render in this font.",
  },
  embedded: {
    color: "blue",
    label: "Embedded",
    hint: "Full font embedded in the PDF. Existing text edits perfectly. New characters render in this font when it includes them - any it lacks (e.g. an accent or symbol the font never carried) fall back to a standard font.",
  },
  subset: {
    color: "yellow",
    label: "Subset",
    hint: "Only the characters the document already uses are embedded. Existing text edits fine, but a new character the document never used will usually fall back to a standard font.",
  },
};

/**
 * Lists the fonts found across the loaded pages with an at-a-glance status
 * (standard / embedded / subset) so the user knows up front how each font
 * behaves when editing - subset (and, for rare glyphs, embedded) fonts are the
 * ones that can drop a brand-new character to a standard fallback font.
 */
function FontsSection({ pages }: { pages: PageSnapshot[] }) {
  // Pure: the font list AND coverage both come from snapshot data + the cmap
  // cache the loader primed during its serialized read. No WASM here, so it's
  // safe to run on every render.
  const fonts = analyzePageFonts(pages);
  if (fonts.length === 0) return null;
  return (
    <Stack gap="xs" data-testid="v2-fonts-panel">
      <Group justify="space-between" wrap="nowrap" gap={4}>
        <SectionLabel>Fonts</SectionLabel>
        <FontsHelp />
      </Group>
      <FontCompatibilitySummary fonts={fonts} />
      {fonts.map((f) => (
        <FontRow key={f.key} font={f} />
      ))}
    </Stack>
  );
}

/** Compact list of missing a-zA-Z0-9, e.g. "q W 7" (capped for width). */
function formatMissing(missing: string[]): string {
  const shown = missing.slice(0, 12).join(" ");
  return missing.length > 12 ? `${shown} +${missing.length - 12}` : shown;
}

/**
 * One font row: name + type badge, plus - when the font's glyphs were read -
 * a concrete a-zA-Z0-9 coverage line ("all letters & numbers" or the specific
 * missing ones). Fonts whose coverage is unknown (Type3 etc.) show just the
 * type badge.
 */
function FontRow({ font }: { font: PageFont }) {
  const meta = FONT_STATUS_META[font.status];
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
        <Tooltip label={meta.hint} multiline w={230} withArrow position="left">
          <Badge
            size="xs"
            color={meta.color}
            variant="light"
            style={{ cursor: "help", flexShrink: 0 }}
            data-testid={`v2-font-${font.status}`}
          >
            {meta.label}
          </Badge>
        </Tooltip>
      </Group>
      {known &&
        (hasGap ? (
          <Tooltip
            label={`This font has no glyph for: ${missing.join(" ")}. Typing one uses a standard fallback font.`}
            multiline
            w={230}
            withArrow
            position="left"
          >
            <Text size="xs" c="yellow.8" data-testid="v2-font-missing">
              Missing: {formatMissing(missing)}
            </Text>
          </Tooltip>
        ) : (
          <Text size="xs" c="dimmed" data-testid="v2-font-full">
            All letters &amp; numbers present
          </Text>
        ))}
    </Stack>
  );
}

/**
 * Top-level editor-compatibility summary for the Fonts section. Every font
 * edits its EXISTING text perfectly; the nuance is what happens to a BRAND-NEW
 * character. Coverage-driven, preferring the CONCRETE glyph probe over the
 * font-type heuristic:
 *  - any font with confirmed-missing a-zA-Z0-9 -> yellow (how many).
 *  - every font confirmed to have the full alphabet+digits -> green.
 *  - otherwise (some coverage unknown, e.g. Type3) -> blue info.
 */
function FontCompatibilitySummary({ fonts }: { fonts: PageFont[] }) {
  const withGaps = fonts.filter(
    (f) => f.coverage.known && f.coverage.missing.length > 0,
  );
  const allConfirmedFull = fonts.every(
    (f) => f.coverage.known && f.coverage.missing.length === 0,
  );
  const tone = withGaps.length > 0 ? "warn" : allConfirmedFull ? "ok" : "info";
  const meta = {
    ok: {
      bg: "var(--mantine-color-green-light)",
      fg: "green.8",
      iconColor: "var(--mantine-color-green-text)",
      Icon: CheckCircleIcon,
      text: "Every font includes the full alphabet and digits - type freely.",
    },
    info: {
      bg: "var(--mantine-color-blue-light)",
      fg: "blue.8",
      iconColor: "var(--mantine-color-blue-text)",
      Icon: InfoIcon,
      text: "Existing text edits perfectly. A new character an embedded font doesn't include falls back to a standard font.",
    },
    warn: {
      bg: "var(--mantine-color-yellow-light)",
      fg: "yellow.8",
      iconColor: "var(--mantine-color-yellow-text)",
      Icon: WarningIcon,
      text: `${withGaps.length} font${withGaps.length === 1 ? "" : "s"} missing some letters or numbers - typing those uses a standard fallback font.`,
    },
  }[tone];
  const Icon = meta.Icon;
  return (
    <Box
      data-testid="v2-font-compat"
      data-compat={tone}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-sm)",
        padding: "6px 10px",
        background: meta.bg,
      }}
    >
      <Icon fontSize="small" style={{ color: meta.iconColor, flexShrink: 0 }} />
      <Text size="xs" c={meta.fg}>
        {meta.text}
      </Text>
    </Box>
  );
}

/**
 * Info (i) popover that explains, in one place, how the editor treats fonts:
 * existing text vs. brand-new characters, and what each status badge means.
 * Surfaced next to the Fonts header so the badges/summary stay terse.
 */
function FontsHelp() {
  return (
    <HoverCard width={272} shadow="md" withArrow position="left-start">
      <HoverCard.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="What do the font statuses mean?"
          data-testid="v2-fonts-info"
        >
          <InfoIcon fontSize="small" />
        </ActionIcon>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack gap={6}>
          <Text size="xs" fw={600}>
            How fonts affect editing
          </Text>
          <Text size="xs" c="dimmed">
            <Text span fw={600} c="dimmed">
              Existing text
            </Text>{" "}
            always edits in its original font.{" "}
            <Text span fw={600} c="dimmed">
              New characters
            </Text>{" "}
            you type keep the original font only when that font includes them -
            otherwise they fall back to a standard font (Helvetica).
          </Text>
          <Stack gap={4}>
            <FontsHelpRow color="green" label="Standard">
              base-14 PDF font - the full standard character set is always
              available.
            </FontsHelpRow>
            <FontsHelpRow color="blue" label="Embedded">
              full font shipped in the PDF - most new characters match; a glyph
              the font lacks falls back.
            </FontsHelpRow>
            <FontsHelpRow color="yellow" label="Subset">
              only the document's existing characters are embedded - new ones
              usually fall back.
            </FontsHelpRow>
          </Stack>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function FontsHelpRow({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <Badge size="xs" color={color} variant="light" style={{ flexShrink: 0 }}>
        {label}
      </Badge>
      <Text size="xs" c="dimmed">
        {children}
      </Text>
    </Group>
  );
}

function EmptySidebar({
  loading,
  progress,
}: {
  loading: boolean;
  progress: LoadProgress | null;
}) {
  return (
    <Stack gap="xs" data-testid="v2-sidebar-empty">
      <Text size="sm" fw={500}>
        No file loaded
      </Text>
      <Text size="xs" c="dimmed">
        Pick a PDF from the Files panel on the left, or drop one in. The editor
        will open it automatically.
      </Text>
      {loading && (
        <Stack gap={4} data-testid="v2-loading">
          <Text size="xs" c="dimmed">
            {progress?.stage ?? "Opening document..."}
          </Text>
          {progress && progress.total > 0 && (
            <Text size="xs" c="dimmed">
              {progress.current} / {progress.total}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function LoadedSidebar({
  state,
  selection,
  mode,
  canGroup,
  canUngroup,
  onToggleAddText,
  onPickImage,
  onGroup,
  onUngroup,
  onSetGroupingMode,
  onSetWidthMode,
}: Omit<SidebarProps, never>) {
  const selectionLabel = formatSelection(selection);
  return (
    <Stack gap="lg" data-testid="v2-sidebar-status">
      <InsertSection
        mode={mode}
        onToggleAddText={onToggleAddText}
        onPickImage={onPickImage}
      />
      <ParagraphSection
        canGroup={canGroup}
        canUngroup={canUngroup}
        onGroup={onGroup}
        onUngroup={onUngroup}
      />
      <Stack gap="sm">
        <SectionLabel>Editor settings</SectionLabel>
        <GroupingModeControl
          mode={state.groupingMode}
          onChange={onSetGroupingMode}
        />
        <WidthModeControl mode={state.widthMode} onChange={onSetWidthMode} />
      </Stack>
      <FontsSection pages={state.pages} />
      <MoveTip />
      {selectionLabel && (
        <Text size="xs" c="blue.6" data-testid="v2-selection-count">
          {selectionLabel}
        </Text>
      )}
    </Stack>
  );
}

function InsertSection({
  mode,
  onToggleAddText,
  onPickImage,
}: {
  mode: "select" | "addText";
  onToggleAddText: () => void;
  onPickImage: () => void;
}) {
  return (
    <Stack gap="xs">
      <SectionLabel>Insert</SectionLabel>
      <Group grow gap="xs" wrap="nowrap">
        <Button
          size="xs"
          variant={mode === "addText" ? "filled" : "default"}
          leftSection={<TextFieldsIcon fontSize="small" />}
          onClick={onToggleAddText}
          data-testid="v2-add-text"
        >
          {mode === "addText" ? "Click page to add text" : "Add text"}
        </Button>
        <Button
          size="xs"
          variant="default"
          leftSection={<ImageIcon fontSize="small" />}
          onClick={onPickImage}
          data-testid="v2-add-image"
        >
          Add image
        </Button>
      </Group>
    </Stack>
  );
}

function ParagraphSection({
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
}: {
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
}) {
  return (
    <Stack gap="xs">
      <SectionLabel>Paragraph</SectionLabel>
      <Group grow gap="xs" wrap="nowrap">
        <Tooltip
          label={
            canGroup
              ? "Merge selected runs into one paragraph (Ctrl+M)"
              : "Select 2+ runs to merge"
          }
        >
          <Button
            size="xs"
            variant="default"
            leftSection={<CallMergeIcon fontSize="small" />}
            onClick={onGroup}
            disabled={!canGroup}
            data-testid="v2-group"
          >
            Group
          </Button>
        </Tooltip>
        <Tooltip
          label={
            canUngroup
              ? "Split this paragraph into one run per line"
              : "Select a multi-line paragraph to ungroup"
          }
        >
          <Button
            size="xs"
            variant="default"
            leftSection={<CallSplitIcon fontSize="small" />}
            onClick={onUngroup}
            disabled={!canUngroup}
            data-testid="v2-ungroup"
          >
            Ungroup
          </Button>
        </Tooltip>
      </Group>
    </Stack>
  );
}

/**
 * Reminder that text boxes are repositioned with Ctrl + drag (the same
 * gesture the overlay listens for).
 */
function MoveTip() {
  return (
    <Box
      data-testid="v2-move-tip"
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-sm)",
        padding: "8px 10px",
        background: "var(--mantine-color-default-hover)",
      }}
    >
      <Text size="xs" c="dimmed">
        Hold <Kbd>Ctrl</Kbd> and drag a text box to move it.
      </Text>
    </Box>
  );
}

/**
 * Toggle between Auto (detect equal-spaced lines as paragraphs) and
 * Line (every source line is its own run). Switching re-reads the
 * document under the new grouping and clears the undo history.
 */
function GroupingModeControl({
  mode,
  onChange,
}: {
  mode: GroupingMode;
  onChange: (mode: GroupingMode) => void;
}) {
  return (
    <Stack gap={4} data-testid="v2-grouping-mode">
      <Text size="xs" fw={500}>
        Text grouping
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        onChange={(value) => onChange(value as GroupingMode)}
        data={[
          { label: "Auto", value: "auto" },
          { label: "Line", value: "line" },
        ]}
        data-testid="v2-grouping-mode-control"
      />
      <Text size="xs" c="dimmed">
        {mode === "auto"
          ? "Equal-spaced lines group into editable paragraphs."
          : "Each source line is edited on its own. Switching clears undo history."}
      </Text>
    </Stack>
  );
}

/**
 * Toggle how a text box resizes as you type past its current width.
 *  - Grow: the box widens to the right and never wraps.
 *  - Wrap: the box keeps its width and overflow wraps onto new lines.
 */
function WidthModeControl({
  mode,
  onChange,
}: {
  mode: WidthMode;
  onChange: (mode: WidthMode) => void;
}) {
  return (
    <Stack gap={4} data-testid="v2-width-mode">
      <Text size="xs" fw={500}>
        Text box width
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        onChange={(value) => onChange(value as WidthMode)}
        data={[
          { label: "Grow", value: "grow" },
          { label: "Wrap", value: "wrap" },
        ]}
        data-testid="v2-width-mode-control"
      />
      <Text size="xs" c="dimmed">
        {mode === "wrap"
          ? "Boxes keep their width; extra text wraps onto new lines."
          : "Boxes widen to the right as you type (no wrapping)."}
      </Text>
    </Stack>
  );
}

function formatSelection(selection: SelectionState): string | null {
  const runs = selection.runIds.length;
  const images = selection.imageIds.length;
  if (runs === 0 && images === 0) return null;
  const parts: string[] = [];
  if (runs > 0)
    parts.push(`${runs} text ${runs === 1 ? "run" : "runs"} selected`);
  if (images > 0)
    parts.push(`${images} ${images === 1 ? "image" : "images"} selected`);
  return parts.join(" · ");
}

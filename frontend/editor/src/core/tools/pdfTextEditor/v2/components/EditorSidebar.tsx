import { Box, Kbd, SegmentedControl, Stack, Text } from "@mantine/core";
import { PageListPanel } from "@app/tools/pdfTextEditor/v2/components/PageListPanel";
import type {
  EditorViewState,
  LoadProgress,
} from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type {
  GroupingMode,
  SelectionState,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";

interface SidebarProps {
  state: EditorViewState;
  selection: SelectionState;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
}

export function EditorSidebar({
  state,
  selection,
  onSetGroupingMode,
  onSetWidthMode,
}: SidebarProps) {
  return (
    <Box p="md" style={{ flex: 1, overflow: "auto" }}>
      {state.hasDocument ? (
        <LoadedSidebar
          state={state}
          selection={selection}
          onSetGroupingMode={onSetGroupingMode}
          onSetWidthMode={onSetWidthMode}
        />
      ) : (
        <EmptySidebar progress={state.progress} loading={state.loading} />
      )}
    </Box>
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
  onSetGroupingMode,
  onSetWidthMode,
}: {
  state: EditorViewState;
  selection: SelectionState;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
}) {
  const selectionLabel = formatSelection(selection);
  return (
    <Stack gap="md" data-testid="v2-sidebar-status">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {state.pageCount} {state.pageCount === 1 ? "page" : "pages"}
        </Text>
        <Text size="xs" c="dimmed">
          Click any text in the document to edit it inline. Selecting a run
          enables the colour and font-size controls above.
        </Text>
        <Text size="xs" c="dimmed">
          {state.dirty
            ? "Unsaved changes - press Save PDF to download."
            : "No changes yet."}
        </Text>
        {selectionLabel && (
          <Text size="xs" c="blue.6" data-testid="v2-selection-count">
            {selectionLabel}
          </Text>
        )}
      </Stack>
      <GroupingModeControl
        mode={state.groupingMode}
        onChange={onSetGroupingMode}
      />
      <WidthModeControl mode={state.widthMode} onChange={onSetWidthMode} />
      <MoveTip />
      <PageListPanel pages={state.pages} />
    </Stack>
  );
}

/**
 * Reminder that text boxes are repositioned with Ctrl + drag (the same
 * gesture the overlay listens for). Styled as a subtle hint card so it
 * sits comfortably beneath the grouping / width controls.
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
        <Text span fw={600} c="dimmed">
          Tip:{" "}
        </Text>
        Hold <Kbd>Ctrl</Kbd> and drag a text box to move it around the page.
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
          ? "Equal-spaced lines are grouped into editable paragraphs."
          : "Each source line is edited on its own. Switching re-reads the document and clears undo history."}
      </Text>
    </Stack>
  );
}

/**
 * Toggle how a text box resizes as you type past its current width.
 *  - Grow: the box widens to the right and never wraps.
 *  - Wrap: the box keeps its width and overflow wraps onto new lines.
 * Styled to match `GroupingModeControl` and sits next to it.
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

import { Box, SegmentedControl, Stack, Text } from "@mantine/core";
import { PageListPanel } from "@app/tools/pdfTextEditor/v2/components/PageListPanel";
import type {
  EditorViewState,
  LoadProgress,
} from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type {
  GroupingMode,
  SelectionState,
} from "@app/tools/pdfTextEditor/v2/types";

interface SidebarProps {
  state: EditorViewState;
  selection: SelectionState;
  onSetGroupingMode: (mode: GroupingMode) => void;
}

export function EditorSidebar({
  state,
  selection,
  onSetGroupingMode,
}: SidebarProps) {
  return (
    <Box p="md" style={{ flex: 1, overflow: "auto" }}>
      {state.hasDocument ? (
        <LoadedSidebar
          state={state}
          selection={selection}
          onSetGroupingMode={onSetGroupingMode}
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
}: {
  state: EditorViewState;
  selection: SelectionState;
  onSetGroupingMode: (mode: GroupingMode) => void;
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
      <PageListPanel pages={state.pages} />
    </Stack>
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

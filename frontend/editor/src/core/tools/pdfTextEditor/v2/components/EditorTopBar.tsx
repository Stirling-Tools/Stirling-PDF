import { Box, Button, Group, Switch, Text, Tooltip } from "@mantine/core";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type {
  PageSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";

interface TopBarProps {
  store: EditorStore;
  hasDocument: boolean;
  dirty: boolean;
  renderScale: number;
  mode: "select" | "addText";
  pages: PageSnapshot[];
  openedFileName: string | null;
  canReset: boolean;
  /** True when ≥2 text runs are selected. */
  canGroup: boolean;
  /** True when exactly one paragraph-grouped run is selected. */
  canUngroup: boolean;
  /** Text-box growth behaviour. */
  widthMode: WidthMode;
  onSetWidthMode: (mode: WidthMode) => void;
  onToggleAddText: () => void;
  onPickImage: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onReset: () => void;
  onSaveToWorkbench: () => void;
  onSave: () => void;
  onShowHelp: () => void;
}

const Z_OUT_LIMIT = 0.25;
const Z_IN_LIMIT = 4;
const Z_STEP = 0.25;
const FIT_PAD_PX = 64;

export function EditorTopBar(props: TopBarProps) {
  const {
    store,
    hasDocument,
    dirty,
    renderScale,
    mode,
    pages,
    openedFileName,
    canReset,
    canGroup,
    canUngroup,
    widthMode,
    onSetWidthMode,
    onToggleAddText,
    onPickImage,
    onGroup,
    onUngroup,
    onReset,
    onSaveToWorkbench,
    onSave,
    onShowHelp,
  } = props;

  return (
    <Group
      gap="xs"
      px="md"
      py="xs"
      style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
    >
      <Text fw={600} size="sm">
        PDF Text Editor
      </Text>
      <Text size="xs" c="dimmed">
        v2
      </Text>
      {openedFileName && (
        <Text
          size="xs"
          c="dimmed"
          data-testid="v2-filename"
          style={{
            maxWidth: 320,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={openedFileName}
        >
          · {openedFileName}
          {dirty ? " *" : ""}
        </Text>
      )}
      <Box style={{ flex: 1 }} />
      {hasDocument && (
        <Group gap="xs">
          <Group gap={4} data-testid="v2-zoom-controls">
            <Button
              size="xs"
              variant="subtle"
              aria-label="Zoom out"
              data-testid="v2-zoom-out"
              onClick={() =>
                store.setRenderScale(
                  Math.max(Z_OUT_LIMIT, +(renderScale - Z_STEP).toFixed(2)),
                )
              }
            >
              -
            </Button>
            <Text size="xs" miw={40} ta="center" data-testid="v2-zoom-percent">
              {Math.round(renderScale * 100)}%
            </Text>
            <Button
              size="xs"
              variant="subtle"
              aria-label="Zoom in"
              data-testid="v2-zoom-in"
              onClick={() =>
                store.setRenderScale(
                  Math.min(Z_IN_LIMIT, +(renderScale + Z_STEP).toFixed(2)),
                )
              }
            >
              +
            </Button>
            <Button
              size="xs"
              variant="subtle"
              aria-label="Reset zoom"
              data-testid="v2-zoom-reset"
              onClick={() => store.setRenderScale(1)}
            >
              100%
            </Button>
            <Button
              size="xs"
              variant="subtle"
              aria-label="Fit to width"
              data-testid="v2-zoom-fit"
              onClick={() => {
                const stage = document.querySelector<HTMLElement>(
                  '[data-testid="v2-stage"]',
                );
                const firstPage = pages[0];
                if (!stage || !firstPage) return;
                const available = stage.clientWidth - FIT_PAD_PX;
                const target = available / Math.max(1, firstPage.width);
                const clamped = Math.min(
                  Z_IN_LIMIT,
                  Math.max(Z_OUT_LIMIT, target),
                );
                store.setRenderScale(+clamped.toFixed(2));
              }}
            >
              Fit
            </Button>
          </Group>
          <Button
            size="xs"
            variant={mode === "addText" ? "filled" : "subtle"}
            onClick={onToggleAddText}
            data-testid="v2-add-text"
          >
            {mode === "addText" ? "Click page to add text" : "Add text"}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={onPickImage}
            data-testid="v2-add-image"
          >
            Add image
          </Button>
          <Tooltip
            label={
              canGroup
                ? "Merge selected runs into one paragraph (Ctrl+M)"
                : "Select 2+ runs (Shift+Click or Ctrl+Shift+drag) to merge"
            }
          >
            <Button
              size="xs"
              variant="subtle"
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
                ? "Split this paragraph back into one line per source line"
                : "Select a multi-line paragraph to ungroup"
            }
          >
            <Button
              size="xs"
              variant="subtle"
              onClick={onUngroup}
              disabled={!canUngroup}
              data-testid="v2-ungroup"
            >
              Ungroup
            </Button>
          </Tooltip>
          <Tooltip
            label={
              widthMode === "wrap"
                ? "Text boxes are locked to their width and wrap downward. Toggle off to let them grow to the right."
                : "Text boxes grow to the right as you type. Toggle on to lock width and wrap downward instead."
            }
          >
            <Switch
              size="xs"
              checked={widthMode === "wrap"}
              onChange={(e) =>
                onSetWidthMode(e.currentTarget.checked ? "wrap" : "grow")
              }
              label="Wrap"
              data-testid="v2-width-mode"
            />
          </Tooltip>
          <Tooltip label="Reset every edit">
            <Button
              size="xs"
              variant="subtle"
              onClick={onReset}
              data-testid="v2-reset"
              disabled={!canReset}
            >
              Reset
            </Button>
          </Tooltip>
          <Tooltip label="Save to Workbench (open in another tool)">
            <Button
              size="xs"
              variant="subtle"
              onClick={onSaveToWorkbench}
              data-testid="v2-save-workbench"
            >
              Save to Workbench
            </Button>
          </Tooltip>
          <Tooltip label="Download edited PDF (Ctrl+S)">
            <Button size="xs" onClick={onSave} data-testid="v2-save">
              Save PDF
            </Button>
          </Tooltip>
          <Tooltip label="Keyboard shortcuts (?)">
            <Button
              size="xs"
              variant="subtle"
              onClick={onShowHelp}
              data-testid="v2-help"
            >
              ?
            </Button>
          </Tooltip>
        </Group>
      )}
    </Group>
  );
}

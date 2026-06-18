import { Box, Button, Group, Text, Tooltip } from "@mantine/core";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

/**
 * Top bar for the v2 text/image editor.
 *
 * This editor is scoped to TEXT and IMAGE editing on top of a PDF
 * substrate. Document-level operations (page rotation, page reorder,
 * page split, print, save-to-workbench-for-another-tool) live in
 * Stirling's dedicated tools and have intentionally been removed
 * from this surface so users don't see overlapping affordances.
 *
 * Kept controls here are app-level chrome only: zoom (editing
 * visibility), save PDF (canonical document output), and keyboard
 * help. The selection controls live in the toolbar below; insert and
 * paragraph actions live in the sidebar.
 */
interface TopBarProps {
  store: EditorStore;
  hasDocument: boolean;
  dirty: boolean;
  renderScale: number;
  pages: PageSnapshot[];
  openedFileName: string | null;
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
    pages,
    openedFileName,
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
              aria-label="Keyboard shortcuts"
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

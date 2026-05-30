import { useEffect, useRef, useState } from "react";
import { Box, Center, Loader, Progress, ScrollArea, Stack, Text } from "@mantine/core";
import {
  useEditorStore,
} from "@app/tools/pdfTextEditor/v2/hooks/useEditorStore";
import { ensurePageRead } from "@app/tools/pdfTextEditor/v2/hooks/useDocumentLoader";
import { MarqueeSelector } from "@app/tools/pdfTextEditor/v2/components/MarqueeSelector";
import { PageView } from "@app/tools/pdfTextEditor/v2/components/PageView";
import { EditTextCommand } from "@app/tools/pdfTextEditor/v2/commands/EditTextCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertTextCommand";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/v2/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/v2/commands/SetImageTransformCommand";
import type { SelectionState } from "@app/tools/pdfTextEditor/v2/types";

const DEFAULT_SCALE = 1.5;

/**
 * Custom workbench view: renders the pages stack with editable overlays.
 * The sidebar shell (`PdfTextEditorV2`) owns the toolbar; this component
 * owns the canvas area. Both subscribe to the same `EditorStore`.
 */
export function PageStage() {
  const { store, state } = useEditorStore();
  const [selection, setSelection] = useState<SelectionState>(
    store.selection.value,
  );
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(
    store.selection.highlight.get(),
  );
  const [draggingFile, setDraggingFile] = useState(false);
  const dragCountRef = useRef(0);

  useEffect(() => store.selection.subscribe(setSelection), [store]);
  useEffect(
    () => store.selection.highlight.subscribe(setHighlightedRunId),
    [store],
  );

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      const insideStage =
        target?.closest('[data-testid="v2-stage"]') ||
        target?.matches?.('[data-testid="v2-stage"]');
      if (!insideStage) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const current = store.getState().renderScale || 1.5;
      const next = Math.min(
        4,
        Math.max(0.25, +(current + direction * 0.1).toFixed(2)),
      );
      store.setRenderScale(next);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [store]);

  if (!state.hasDocument && !state.loading) {
    return (
      <Center h="100%" data-testid="v2-stage-empty">
        <Stack align="center" gap="xs">
          <Text c="dimmed">No document loaded.</Text>
          <Text c="dimmed" size="sm">
            Pick a PDF from the Files panel on the left to begin editing.
          </Text>
        </Stack>
      </Center>
    );
  }

  // Loading overlay is layered on TOP of the pages stack: PageView's
  // IntersectionObserver only fires when PageView is mounted, so an
  // early-return loader leaves page 0 stuck "not yet rendered".
  const showLoading =
    state.loading || (state.hasDocument && !state.firstPageRendered);
  const p = state.progress;
  const percent =
    p && p.total > 0 ? Math.round((p.current / p.total) * 100) : null;
  const stageLabel =
    p?.stage ??
    (state.hasDocument ? "Rendering preview" : "Loading document");

  return (
    <Box
      pos="relative"
      h="100%"
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
          dragCountRef.current += 1;
          setDraggingFile(true);
        }
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
          e.preventDefault();
        }
      }}
      onDragLeave={() => {
        dragCountRef.current = Math.max(0, dragCountRef.current - 1);
        if (dragCountRef.current === 0) setDraggingFile(false);
      }}
      onDrop={(e) => {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const pdf = Array.from(files).find(
          (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
        );
        if (!pdf) return;
        e.preventDefault();
        dragCountRef.current = 0;
        setDraggingFile(false);
        const input = document.querySelector<HTMLInputElement>(
          '[data-testid="v2-file-input"]',
        );
        if (!input) return;
        const dt = new DataTransfer();
        dt.items.add(pdf);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    >
      {draggingFile && (
        <Center
          pos="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          style={{
            background: "rgba(0, 100, 200, 0.08)",
            border: "3px dashed rgba(0, 100, 200, 0.4)",
            zIndex: 200,
            pointerEvents: "none",
          }}
          data-testid="v2-drop-overlay"
        >
          <Stack align="center" gap="xs">
            <Text fw={600} size="lg">
              Drop a PDF to open
            </Text>
            <Text size="sm" c="dimmed">
              Releases on the editor stage replace any open document.
            </Text>
          </Stack>
        </Center>
      )}
      {showLoading && (
        <Center
          pos="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          style={{
            background: "rgba(255,255,255,0.9)",
            zIndex: 100,
          }}
          data-testid="v2-stage-loading"
        >
          <Stack align="center" gap="sm" w={320}>
            <Loader size="md" />
            <Text fw={500}>{stageLabel}</Text>
            {percent !== null ? (
              <Progress
                value={percent}
                w="100%"
                size="sm"
                data-testid="v2-load-progress"
                aria-label="Loading progress"
              />
            ) : (
              <Progress
                value={100}
                animated
                w="100%"
                size="sm"
                data-testid="v2-load-progress"
                aria-label="Loading progress"
              />
            )}
            {p && p.total > 0 && (
              <Text size="xs" c="dimmed">
                {p.current} / {p.total}
              </Text>
            )}
          </Stack>
        </Center>
      )}
      <MarqueeSelector store={store} />
      <ScrollArea h="100%" type="auto" data-testid="v2-stage">
      <Box
        py="lg"
        onMouseDown={() => store.selection.clear()}
        data-testid="v2-pages"
      >
        <Stack gap="lg" align="center">
          {state.pages.map((page) =>
            store.document ? (
              <PageView
                key={page.pageIndex}
                document={store.document}
                page={page}
                scale={state.renderScale || DEFAULT_SCALE}
                selectedRunIds={selection.runIds}
                selectedImageIds={selection.imageIds}
                highlightedRunId={highlightedRunId}
                onSelectRun={(runId, shiftKey) => {
                  if (shiftKey) store.selection.toggle(runId);
                  else store.selection.selectOne(runId);
                }}
                onSelectImage={(imageId) => store.selection.selectImage(imageId)}
                onEditRun={(pageIndex, runId, nextText) => {
                  store.dispatch(
                    new EditTextCommand({ pageIndex, runId, nextText }),
                  );
                }}
                onMoveRun={(pageIndex, runId, dx, dy) => {
                  store.dispatch(
                    new MoveTextRunCommand({ pageIndex, runId, dx, dy }),
                  );
                }}
                onPageClick={(pageIndex, pageX, pageY) => {
                  if (state.mode !== "addText") return;
                  const cmd = new InsertTextCommand({
                    pageIndex,
                    x: pageX,
                    y: pageY,
                    text: "New text",
                  });
                  store.dispatch(cmd);
                  if (cmd.insertedRunId) {
                    store.selection.selectOne(cmd.insertedRunId);
                  }
                  store.setMode("select");
                }}
                onTransformImage={(pageIndex, imageId, nextBounds) => {
                  store.dispatch(
                    new SetImageTransformCommand({
                      pageIndex,
                      imageId,
                      nextBounds,
                    }),
                  );
                }}
                onFirstVisible={(pageIndex) =>
                  ensurePageRead(store, pageIndex)
                }
                onFirstRendered={(pageIndex) => {
                  if (pageIndex === 0) store.markFirstPageRendered();
                }}
              />
            ) : null,
          )}
        </Stack>
      </Box>
    </ScrollArea>
    </Box>
  );
}

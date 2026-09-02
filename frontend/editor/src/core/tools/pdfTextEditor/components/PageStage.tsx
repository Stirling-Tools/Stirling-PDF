import { useEffect, useRef, useState } from "react";
import {
  Box,
  Center,
  Loader,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@app/tools/pdfTextEditor/hooks/useEditorStore";
import { ensurePageRead } from "@app/tools/pdfTextEditor/hooks/useDocumentLoader";
import { Toolbar } from "@app/tools/pdfTextEditor/components/Toolbar";
import { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";
import { ZoomPill } from "@app/tools/pdfTextEditor/components/ZoomPill";
import { MarqueeSelector } from "@app/tools/pdfTextEditor/components/MarqueeSelector";
import { PageView } from "@app/tools/pdfTextEditor/components/PageView";
import { EditTextCommand } from "@app/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@app/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/commands/InsertTextCommand";
import { InsertTableCommand } from "@app/tools/pdfTextEditor/commands/InsertTableCommand";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/commands/SetImageTransformCommand";
import type { SelectionState } from "@app/tools/pdfTextEditor/types";

const DEFAULT_SCALE = 1.5;

// Custom workbench view: the contextual formatting toolbar as a bar across the
// top, then the scrollable pages stack with editable overlays beneath.
export function PageStage() {
  const { t } = useTranslation();
  const { store, state } = useEditorStore();
  const [selection, setSelection] = useState<SelectionState>(
    store.selection.value,
  );
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(
    store.selection.highlight.get(),
  );
  const [draggingFile, setDraggingFile] = useState(false);
  const dragCountRef = useRef(0);
  const stageRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => store.selection.subscribe(setSelection), [store]);
  useEffect(
    () => store.selection.highlight.subscribe(setHighlightedRunId),
    [store],
  );

  // Ctrl/Cmd+wheel zooms the document.
  useEffect(() => {
    const el = stageRootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const current = store.getState().renderScale || 1.5;
      const next = Math.min(
        4,
        Math.max(0.25, +(current + direction * 0.1).toFixed(2)),
      );
      store.setRenderScale(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store, state.hasDocument, state.loading]);

  // The strip carries undo/redo plus the contextual formatting group. The
  // inspector derives from the same controller, so both surfaces read one
  // source of truth.
  const controller = useToolbarController(store, state, selection);
  const toolbar = { controller };

  if (!state.hasDocument && !state.loading) {
    return (
      <Stack gap={0} h="100%" style={{ overflow: "hidden" }}>
        <Toolbar {...toolbar} />
        <Center
          style={{ flex: 1, minHeight: 0 }}
          data-testid="pdf-editor-stage-empty"
        >
          <Stack align="center" gap="xs">
            <Text c="dimmed">
              {t("pdfTextEditor.stage.noDocument", "No document loaded.")}
            </Text>
            <Text c="dimmed" size="sm">
              {t(
                "pdfTextEditor.stage.pickPrompt",
                "Pick a PDF from the Files panel on the left to begin editing.",
              )}
            </Text>
          </Stack>
        </Center>
      </Stack>
    );
  }

  // Loading overlay is layered on TOP of the pages stack: PageView's
  // IntersectionObserver only fires when PageView is mounted.
  const showLoading =
    state.loading || (state.hasDocument && !state.firstPageRendered);
  const p = state.progress;
  const percent =
    p && p.total > 0 ? Math.round((p.current / p.total) * 100) : null;
  const stageLabel =
    p?.stage ??
    (state.hasDocument
      ? t("pdfTextEditor.stage.renderingPreview", "Rendering preview")
      : t("pdfTextEditor.stage.loadingDocument", "Loading document"));

  return (
    <Stack gap={0} h="100%" style={{ overflow: "hidden" }}>
      <Toolbar {...toolbar} />
      <Box
        pos="relative"
        ref={stageRootRef}
        style={{ flex: 1, minHeight: 0 }}
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
          // ALWAYS claim the drop: without preventDefault the browser navigates
          // the tab to the dropped file, discarding the editor.
          e.preventDefault();
          dragCountRef.current = 0;
          setDraggingFile(false);
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          const pdf = Array.from(files).find(
            (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
          );
          if (!pdf) return;
          // Replacing the open document discards in-progress edits - confirm
          // first when dirty, so an accidental drop can't silently lose work.
          if (
            store.getState().dirty &&
            !window.confirm(
              t(
                "pdfTextEditor.confirmReplaceDirty",
                "You have unsaved changes. Replace the open document and discard them?",
              ),
            )
          ) {
            return;
          }
          const input = document.querySelector<HTMLInputElement>(
            '[data-testid="pdf-editor-file-input"]',
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
            data-testid="pdf-editor-drop-overlay"
          >
            <Stack align="center" gap="xs">
              <Text fw={600} size="lg">
                {t("pdfTextEditor.drop.title", "Drop a PDF to open")}
              </Text>
              <Text size="sm" c="dimmed">
                {t(
                  "pdfTextEditor.drop.hint",
                  "Releases on the editor stage replace any open document.",
                )}
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
            data-testid="pdf-editor-stage-loading"
          >
            <Stack align="center" gap="sm" w={320}>
              <Loader size="md" />
              <Text fw={500}>{stageLabel}</Text>
              {percent !== null ? (
                <Progress
                  value={percent}
                  w="100%"
                  size="sm"
                  data-testid="pdf-editor-load-progress"
                  aria-label={t(
                    "pdfTextEditor.stage.loadingProgress",
                    "Loading progress",
                  )}
                />
              ) : (
                <Progress
                  value={100}
                  animated
                  w="100%"
                  size="sm"
                  data-testid="pdf-editor-load-progress"
                  aria-label={t(
                    "pdfTextEditor.stage.loadingProgress",
                    "Loading progress",
                  )}
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
        <ScrollArea h="100%" type="auto" data-testid="pdf-editor-stage">
          <Box
            py="lg"
            onPointerDown={(e) => {
              // Shift means "extend" here (shift-click) and Ctrl/Cmd+Shift
              // starts the marquee: neither may wipe what it is about to add
              // to. A plain press on bare page still clears.
              if (e.shiftKey) return;
              store.selection.clear();
            }}
            data-testid="pdf-editor-pages"
          >
            <Stack gap="lg" align="center">
              {state.pages.map((page) =>
                store.document ? (
                  <PageView
                    key={page.pageIndex}
                    document={store.document}
                    store={store}
                    page={page}
                    scale={state.renderScale || DEFAULT_SCALE}
                    widthMode={state.widthMode}
                    showRulers={state.showRulers}
                    selectedRunIds={selection.runIds}
                    selectedImageIds={selection.imageIds}
                    highlightedRunId={highlightedRunId}
                    onSelectRun={(runId, shiftKey) => {
                      if (shiftKey) store.selection.toggle(runId);
                      else store.selection.selectOne(runId);
                    }}
                    onSelectImage={(imageId) =>
                      store.selection.selectImage(imageId)
                    }
                    onEditRun={(pageIndex, runId, nextText) => {
                      // contentEditable can fire several input events per
                      // keystroke burst.
                      const current = store.document
                        ?.page(pageIndex)
                        .findRun(runId);
                      if (current && current.text === nextText) return;
                      store.dispatch(
                        new EditTextCommand({ pageIndex, runId, nextText }),
                      );
                    }}
                    onMoveRun={(pageIndex, runId, dx, dy) => {
                      store.dispatch(
                        new MoveTextRunCommand({ pageIndex, runId, dx, dy }),
                      );
                    }}
                    onWrapRun={(pageIndex, runId, maxWidthPt) => {
                      store.dispatch(
                        new ReflowWrapCommand({ pageIndex, runId, maxWidthPt }),
                      );
                    }}
                    onPageClick={(pageIndex, pageX, pageY) => {
                      if (state.mode === "addTable") {
                        const cmd = new InsertTableCommand({
                          pageIndex,
                          x: pageX,
                          y: pageY,
                          width: 360,
                          height: 24 * 3,
                          rows: 3,
                          cols: 3,
                        });
                        store.dispatch(cmd);
                        store.setMode("select");
                        return;
                      }
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
        {state.hasDocument && (
          <ZoomPill
            store={store}
            renderScale={state.renderScale}
            pages={state.pages}
          />
        )}
      </Box>
    </Stack>
  );
}

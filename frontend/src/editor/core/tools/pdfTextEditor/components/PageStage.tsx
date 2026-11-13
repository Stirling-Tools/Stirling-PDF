import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Center,
  Loader,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import { useDeferredPanelView } from "@editor/tools/pdfTextEditor/hooks/useDeferredPanelView";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditorTopBar } from "@editor/tools/pdfTextEditor/components/EditorTopBar";
import { MobileEditorTopBar } from "@editor/tools/pdfTextEditor/components/MobileEditorTopBar";
import { MobileActionBar } from "@editor/tools/pdfTextEditor/components/MobileActionBar";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { fitToWidthScale } from "@editor/tools/pdfTextEditor/util/fitToWidth";
import { FindBar } from "@editor/tools/pdfTextEditor/components/FindBar";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { ZoomPill } from "@editor/tools/pdfTextEditor/components/ZoomPill";
import { MarqueeSelector } from "@editor/tools/pdfTextEditor/components/MarqueeSelector";
import { PageView } from "@editor/tools/pdfTextEditor/components/PageView";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { MoveShapeCommand } from "@editor/tools/pdfTextEditor/commands/MoveShapeCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { InsertTableCommand } from "@editor/tools/pdfTextEditor/commands/InsertTableCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@editor/tools/pdfTextEditor/commands/SetImageTransformCommand";
import type {
  SelectionState,
  TextRange,
} from "@editor/tools/pdfTextEditor/types";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

const DEFAULT_SCALE = 1.5;
const DESKTOP_FIT_PAD_PX = 64;
const MOBILE_FIT_PAD_PX = 16;

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
  const isMobile = useIsMobile();

  const pageHandlers = useMemo(() => pageViewHandlers(store), [store]);

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

  // Deferred so the typed letter is drawn before the bars, which a burst of typing outdates.
  const bars = useDeferredPanelView(state, selection);
  const [actionBarSlot, setActionBarSlot] = useState<HTMLDivElement | null>(
    null,
  );

  const lastFitRef = useRef<{
    doc: object;
    width: number;
    scale: number;
  } | null>(null);
  const firstPageWidth = state.pages[0]?.width;
  useEffect(() => {
    const doc = store.document;
    const stage = stageRootRef.current;
    if (!isMobile || !doc || !stage || !firstPageWidth) return;
    const fit = () => {
      const width = stage.clientWidth;
      if (!width) return;
      const last = lastFitRef.current;
      // Refit on rotate/resize only while the user has not zoomed away from the fit.
      if (
        last?.doc === doc &&
        (last.width === width || store.getState().renderScale !== last.scale)
      ) {
        return;
      }
      const scale = fitToWidthScale(width, firstPageWidth, MOBILE_FIT_PAD_PX);
      lastFitRef.current = { doc, width, scale };
      store.setRenderScale(scale);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [isMobile, firstPageWidth, store]);

  const topBar = (
    <StageBars
      store={store}
      state={bars.state}
      selection={bars.selection}
      mobile={isMobile}
      actionBarSlot={actionBarSlot}
    />
  );

  if (!state.hasDocument && !state.loading) {
    return (
      <Stack gap={0} h="100%" style={{ overflow: "hidden" }}>
        {topBar}
        <Center
          style={{ flex: 1, minHeight: 0 }}
          data-testid="pdf-editor-stage-empty"
        >
          <Stack align="center" gap="xs" px="md">
            <Text c="dimmed">
              {t("pdfTextEditor.stage.noDocument", "No document loaded.")}
            </Text>
            {isMobile ? (
              <Button
                size="xl"
                leftSection={<Icon name="file-up" size={22} />}
                onClick={() =>
                  document
                    .querySelector<HTMLInputElement>(
                      '[data-testid="pdf-editor-file-input"]',
                    )
                    ?.click()
                }
                data-testid="pdf-editor-mobile-open"
              >
                {t("pdfTextEditor.mobile.openPdf", "Open a PDF")}
              </Button>
            ) : (
              <Text c="dimmed" size="sm">
                {t(
                  "pdfTextEditor.stage.pickPrompt",
                  "Pick a PDF from the Files panel on the left to begin editing.",
                )}
              </Text>
            )}
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
      {topBar}
      {state.findOpen && state.hasDocument && (
        <FindBar
          store={store}
          pages={state.pages}
          onClose={() => store.setFindOpen(false)}
        />
      )}
      <Box
        pos="relative"
        ref={stageRootRef}
        style={{ flex: 1, minHeight: 0 }}
        // Each handler stops the event: the workbench wraps this stage and would
        // otherwise also add the dropped file to the workspace.
        onDragEnter={(e) => {
          e.stopPropagation();
          if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
            dragCountRef.current += 1;
            setDraggingFile(true);
          }
        }}
        onDragOver={(e) => {
          e.stopPropagation();
          if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
            e.preventDefault();
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          dragCountRef.current = Math.max(0, dragCountRef.current - 1);
          if (dragCountRef.current === 0) setDraggingFile(false);
        }}
        onDrop={(e) => {
          // ALWAYS claim the drop: without preventDefault the browser navigates
          // the tab to the dropped file, discarding the editor.
          e.preventDefault();
          e.stopPropagation();
          dragCountRef.current = 0;
          setDraggingFile(false);
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          const pdf = Array.from(files).find(
            (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
          );
          if (!pdf) return;
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
            py={isMobile ? "sm" : "lg"}
            onPointerDown={(e) => {
              // Shift means "extend" here (shift-click) and Ctrl/Cmd+Shift
              // starts the marquee: neither may wipe what it is about to add
              // to. A plain press on bare page still clears.
              if (e.shiftKey) return;
              store.selection.clear();
            }}
            data-testid="pdf-editor-pages"
          >
            <Stack gap={isMobile ? "sm" : "lg"} align="center">
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
                    selectedShapeIds={selection.shapeIds}
                    highlightedRunId={highlightedRunId}
                    selectedTextRange={selection.textRange}
                    {...pageHandlers}
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
            fitPaddingPx={isMobile ? MOBILE_FIT_PAD_PX : DESKTOP_FIT_PAD_PX}
            compact={isMobile}
          />
        )}
      </Box>
      {/* StageBars portals the action bar here so both bars share one toolbar controller. */}
      {isMobile && state.hasDocument && (
        <div ref={setActionBarSlot} style={{ display: "contents" }} />
      )}
    </Stack>
  );
}

/**
 * The page views' handlers, made once per store: PageView is memoised, so a
 * handler made per render would re-render every page on any store change.
 * They read the store when called, never state captured at render.
 */
function pageViewHandlers(store: EditorStore) {
  return {
    onSelectRun: (runId: string, shiftKey: boolean) => {
      if (shiftKey) store.selection.toggle(runId);
      else store.selection.selectOne(runId);
    },
    onSelectRunText: (runId: string, range: TextRange | null) =>
      store.selection.setTextRange(runId, range),
    onSelectImage: (imageId: string) => store.selection.selectImage(imageId),
    onSelectShape: (shapeId: string, extend: boolean) => {
      if (extend) store.selection.toggleShape(shapeId);
      else store.selection.selectShape(shapeId);
    },
    onMoveShape: (
      pageIndex: number,
      shapeId: string,
      dx: number,
      dy: number,
    ) => {
      store.dispatch(new MoveShapeCommand({ pageIndex, shapeId, dx, dy }));
      store.selection.selectShape(shapeId);
    },
    onEditRun: (pageIndex: number, runId: string, nextText: string) => {
      // contentEditable can fire several input events per keystroke burst.
      const current = store.document?.page(pageIndex).findRun(runId);
      if (current && current.text === nextText) return;
      store.dispatch(new EditTextCommand({ pageIndex, runId, nextText }));
    },
    onMoveRun: (pageIndex: number, runId: string, dx: number, dy: number) => {
      store.dispatch(new MoveTextRunCommand({ pageIndex, runId, dx, dy }));
    },
    onWrapRun: (pageIndex: number, runId: string, maxWidthPt: number) => {
      store.dispatch(new ReflowWrapCommand({ pageIndex, runId, maxWidthPt }));
    },
    onResizeRun: (pageIndex: number, runId: string, widthPt: number) => {
      store.dispatch(
        new ReflowWrapCommand({
          pageIndex,
          runId,
          maxWidthPt: widthPt,
          explicit: true,
        }),
      );
    },
    onPageClick: (pageIndex: number, pageX: number, pageY: number) => {
      const { mode } = store.getState();
      if (mode === "addTable") {
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
      if (mode !== "addText") return;
      const cmd = new InsertTextCommand({
        pageIndex,
        x: pageX,
        y: pageY,
        text: "New text",
      });
      store.dispatch(cmd);
      if (cmd.insertedRunId) store.selection.selectOne(cmd.insertedRunId);
      store.setMode("select");
    },
    onTransformImage: (
      pageIndex: number,
      imageId: string,
      nextBounds: { x: number; y: number; width: number; height: number },
    ) => {
      store.dispatch(
        new SetImageTransformCommand({ pageIndex, imageId, nextBounds }),
      );
    },
    onFirstVisible: (pageIndex: number) => ensurePageRead(store, pageIndex),
    onFirstRendered: (pageIndex: number) => {
      if (pageIndex === 0) store.markFirstPageRendered();
    },
  };
}

interface StageBarsProps {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
  mobile: boolean;
  actionBarSlot: HTMLElement | null;
}

// One component for both bars so they share one toolbar controller; the action bar is portalled below the pages.
const StageBars = memo(function StageBars({
  store,
  state,
  selection,
  mobile,
  actionBarSlot,
}: StageBarsProps) {
  const controller = useToolbarController(store, state, selection);
  if (!mobile)
    return (
      <EditorTopBar
        controller={controller}
        hasDocument={state.hasDocument}
        dirty={state.dirty}
        addTextArmed={state.mode === "addText"}
        addTableArmed={state.mode === "addTable"}
        onToggleAddTable={() => store.toggleMode("addTable")}
        onToggleAddText={() => store.toggleMode("addText")}
        findOpen={state.findOpen}
        onToggleFind={() => store.toggleFindOpen()}
        onShowHelp={() => store.setHelpOpen(true)}
      />
    );
  return (
    <>
      <MobileEditorTopBar
        controller={controller}
        hasDocument={state.hasDocument}
        dirty={state.dirty}
      />
      {actionBarSlot &&
        createPortal(
          <MobileActionBar
            store={store}
            controller={controller}
            addTextArmed={state.mode === "addText"}
            addTableArmed={state.mode === "addTable"}
            findOpen={state.findOpen}
          />,
          actionBarSlot,
        )}
    </>
  );
});

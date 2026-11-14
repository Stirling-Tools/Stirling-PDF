import { useEffect, useRef } from "react";
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
import { useEditorStore } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import { MobileEditorTopBar } from "@editor/tools/pdfTextEditor/components/MobileEditorTopBar";
import { MobileActionBar } from "@editor/tools/pdfTextEditor/components/MobileActionBar";
import { fitToWidthScale } from "@editor/tools/pdfTextEditor/util/fitToWidth";
import { FindBar } from "@editor/tools/pdfTextEditor/components/FindBar";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { ZoomPill } from "@editor/tools/pdfTextEditor/components/ZoomPill";
import { MarqueeSelector } from "@editor/tools/pdfTextEditor/components/MarqueeSelector";
import { PageView } from "@editor/tools/pdfTextEditor/components/PageView";
import {
  useEditorSelection,
  useHighlightedRunId,
} from "@editor/tools/pdfTextEditor/hooks/useEditorSelection";
import { pageViewHandlers } from "@editor/tools/pdfTextEditor/util/pageViewHandlers";

const DEFAULT_SCALE = 1.5;
const FIT_PAD_PX = 16;

// The phone's full-screen editing canvas: the formatting toolbar across the
// top, the scrollable pages stack with editable overlays, then the action bar.
// Desktop edits on the viewer's pages instead.
export function PageStage() {
  const { t } = useTranslation();
  const { store, state } = useEditorStore();
  const selection = useEditorSelection(store);
  const highlightedRunId = useHighlightedRunId(store);
  const stageRootRef = useRef<HTMLDivElement | null>(null);

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

  const lastFitRef = useRef<{
    doc: object;
    width: number;
    scale: number;
  } | null>(null);
  const firstPageWidth = state.pages[0]?.width;
  useEffect(() => {
    const doc = store.document;
    const stage = stageRootRef.current;
    if (!doc || !stage || !firstPageWidth) return;
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
      const scale = fitToWidthScale(width, firstPageWidth, FIT_PAD_PX);
      lastFitRef.current = { doc, width, scale };
      store.setRenderScale(scale);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [firstPageWidth, store]);

  const topBar = (
    <MobileEditorTopBar
      controller={controller}
      hasDocument={state.hasDocument}
      dirty={state.dirty}
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
            <Text c="dimmed" size="sm" ta="center">
              {t(
                "pdfTextEditor.stage.choosePrompt",
                "Choose a PDF from your files to start editing.",
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
      {topBar}
      {state.findOpen && state.hasDocument && (
        <FindBar
          store={store}
          pages={state.pages}
          onClose={() => store.setFindOpen(false)}
        />
      )}
      <Box pos="relative" ref={stageRootRef} style={{ flex: 1, minHeight: 0 }}>
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
            py="sm"
            onPointerDown={(e) => {
              // Shift means "extend" here (shift-click) and Ctrl/Cmd+Shift
              // starts the marquee: neither may wipe what it is about to add
              // to. A plain press on bare page still clears.
              if (e.shiftKey) return;
              store.selection.clear();
            }}
            data-testid="pdf-editor-pages"
          >
            <Stack gap="sm" align="center">
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
                    {...pageViewHandlers(store)}
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
            fitPaddingPx={FIT_PAD_PX}
            compact
          />
        )}
      </Box>
      {state.hasDocument && (
        <MobileActionBar
          store={store}
          controller={controller}
          addTextArmed={state.mode === "addText"}
          addTableArmed={state.mode === "addTable"}
          findOpen={state.findOpen}
        />
      )}
    </Stack>
  );
}

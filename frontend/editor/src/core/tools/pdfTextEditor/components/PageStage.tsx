import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Center,
  Group,
  Loader,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@app/tools/pdfTextEditor/hooks/useEditorStore";
import { ensurePageRead } from "@app/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditorTopBar } from "@app/tools/pdfTextEditor/components/EditorTopBar";
import { MobileEditorTopBar } from "@app/tools/pdfTextEditor/components/MobileEditorTopBar";
import { MobileActionBar } from "@app/tools/pdfTextEditor/components/MobileActionBar";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { fitToWidthScale } from "@app/tools/pdfTextEditor/util/fitToWidth";
import { FindBar } from "@app/tools/pdfTextEditor/components/FindBar";
import { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";
import { ZoomPill } from "@app/tools/pdfTextEditor/components/ZoomPill";
import { MarqueeSelector } from "@app/tools/pdfTextEditor/components/MarqueeSelector";
import { PageView } from "@app/tools/pdfTextEditor/components/PageView";
import { EditTextCommand } from "@app/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@app/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/commands/InsertTextCommand";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/commands/SetImageTransformCommand";
import {
  recallEditorScroll,
  rememberEditorScroll,
  takePendingEditorScroll,
  takePendingPoster,
  type EditorPoster,
} from "@app/tools/pdfTextEditor/viewerHandoff";
import type { SelectionState } from "@app/tools/pdfTextEditor/types";

const DEFAULT_SCALE = 1.5;
const DESKTOP_FIT_PAD_PX = 64;
const MOBILE_FIT_PAD_PX = 16;
const SCROLL_RESTORE_FRAMES = 30;
// Bitmap renders asynchronously; poll briefly while nothing painted yet.
const POSTER_POLL_MS = 250;
const POSTER_POLLS = 4;
// Never trap the user behind a bitmap that cannot paint underneath.
const POSTER_MAX_MS = 4000;
const POSTER_FADE_MS = 200;

/** Where the stage must land: the carried page fraction, or a remembered
 * scroll fraction for a document whose canvas remounted. */
type ScrollRestoreTarget =
  | { kind: "page"; page: number; offsetFraction: number }
  | { kind: "fraction"; fraction: number };

/** Editor ScrollArea viewport. Mantine sets inline overflowY scroll with no
 * marker attribute (ScrollAreaViewport.mjs), so scan overflow, not classes. */
function findEditorScroller(stage: HTMLElement | null): HTMLElement | null {
  if (!stage) return null;
  const candidates = stage.querySelectorAll<HTMLElement>("div");
  for (const el of candidates) {
    if (el.scrollHeight > el.clientHeight + 5) {
      const overflow = getComputedStyle(el).overflowY;
      if (/auto|scroll|overlay/.test(overflow)) return el;
    }
  }
  return null;
}

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

  // Claim the scroll target the loader staged from the viewer handoff, once
  // per document. A fraction keeps it valid across the zoom change. Without
  // a staged target, fall back to where this document was left before its
  // canvas unmounted.
  const pendingScrollTargetRef = useRef<ScrollRestoreTarget | null>(null);
  const scrollDocRef = useRef<object | null>(null);
  // Viewer bitmap covering the load; null once the real pages paint.
  const [poster, setPoster] = useState<EditorPoster | null>(null);
  const [posterFading, setPosterFading] = useState(false);
  const posterRef = useRef<EditorPoster | null>(null);
  const posterTimersRef = useRef<number[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    posterTimersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  // Single teardown, in order: stop timers, free an in-flight bitmap, drop
  // its state so a remount never shows a revoked URL.
  useEffect(
    () => () => {
      for (const id of posterTimersRef.current) window.clearTimeout(id);
      posterTimersRef.current = [];
      const current = posterRef.current;
      posterRef.current = null;
      setPoster(null);
      setPosterFading(false);
      if (current) {
        try {
          URL.revokeObjectURL(current.objectUrl);
        } catch {
          /* bitmap already freed */
        }
      }
    },
    [],
  );
  const dismissPoster = useCallback(() => {
    const current = posterRef.current;
    if (!current) return;
    posterRef.current = null;
    setPosterFading(true);
    later(POSTER_FADE_MS, () => {
      setPoster(null);
      setPosterFading(false);
      try {
        URL.revokeObjectURL(current.objectUrl);
      } catch {
        /* bitmap already freed */
      }
    });
  }, [later]);
  const handlePaintedPage = useCallback(
    (pageIndex: number) => {
      if (posterRef.current?.pageIndex === pageIndex) dismissPoster();
    },
    [dismissPoster],
  );
  useEffect(() => {
    const doc = store.document;
    if (!doc || state.pages.length === 0) return;
    if (scrollDocRef.current === doc) return;
    scrollDocRef.current = doc;
    const staged = takePendingEditorScroll();
    if (staged) {
      pendingScrollTargetRef.current = {
        kind: "page",
        page: staged.page,
        offsetFraction: staged.offsetFraction,
      };
    } else {
      const fraction = recallEditorScroll(doc);
      pendingScrollTargetRef.current =
        fraction === null ? null : { kind: "fraction", fraction };
    }
    setPosterFading(false);
    const approved = takePendingPoster();
    if (approved) {
      posterRef.current = approved;
      setPoster(approved);
      later(POSTER_MAX_MS, () => dismissPoster());
    } else {
      let polls = 0;
      const poll = () => {
        if (posterRef.current || store.getState().firstPageRendered) return;
        const late = takePendingPoster();
        if (late) {
          posterRef.current = late;
          setPoster(late);
          later(POSTER_MAX_MS, () => dismissPoster());
        } else if (++polls < POSTER_POLLS) {
          later(POSTER_POLL_MS, poll);
        }
      };
      later(POSTER_POLL_MS, poll);
    }
  }, [store, state.pages.length, state.hasDocument, dismissPoster]);

  // Remember the position on unmount so a warm remount lands back on it.
  useEffect(() => {
    const doc = store.document;
    if (!doc) return;
    return () => {
      const stage = document.querySelector<HTMLElement>(
        '[data-testid="pdf-editor-stage"]',
      );
      const scroller = findEditorScroller(stage);
      if (scroller && scroller.scrollHeight > 0) {
        rememberEditorScroll(doc, scroller.scrollTop / scroller.scrollHeight);
      }
    };
  }, [store]);

  // Land the carried reading position before the user notices the top. Holds
  // briefly while bitmaps paint; user scroll intent releases it immediately.
  useEffect(() => {
    const target = pendingScrollTargetRef.current;
    if (!target || state.pages.length === 0) return;
    const pageIndex =
      target.kind === "page"
        ? Math.min(Math.max(1, target.page), state.pages.length) - 1
        : null;
    let cancelled = false;
    let frames = 0;
    let scroller: HTMLElement | null = null;
    let release: (() => void) | null = null;
    const onIntent = () => {
      cancelled = true;
      pendingScrollTargetRef.current = null;
    };
    const retry = () => {
      if (++frames < SCROLL_RESTORE_FRAMES) {
        requestAnimationFrame(apply);
      } else {
        release?.();
        pendingScrollTargetRef.current = null;
      }
    };
    const apply = () => {
      if (cancelled) return;
      if (!scroller) {
        const stage = document.querySelector<HTMLElement>(
          '[data-testid="pdf-editor-stage"]',
        );
        scroller = findEditorScroller(stage);
      }
      if (!scroller || scroller.scrollHeight === 0) {
        retry();
        return;
      }
      if (!release) {
        const events = ["wheel", "touchstart", "pointerdown", "keydown"];
        for (const name of events) {
          scroller.addEventListener(name, onIntent, { passive: true });
        }
        const held = scroller;
        release = () => {
          for (const name of events) {
            held.removeEventListener(name, onIntent);
          }
        };
      }
      let next: number | null = null;
      if (target.kind === "fraction") {
        next = target.fraction * scroller.scrollHeight;
      } else {
        const pageEl = document.querySelector<HTMLElement>(
          `[data-testid="pdf-editor-page-${pageIndex}"]`,
        );
        if (!pageEl || pageEl.clientHeight === 0) {
          retry();
          return;
        }
        const pageTop =
          pageEl.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        next = Math.max(
          0,
          pageTop + target.offsetFraction * pageEl.clientHeight,
        );
      }
      scroller.scrollTop = next;
      if (Math.abs(scroller.scrollTop - next) <= 2) {
        release?.();
        pendingScrollTargetRef.current = null;
        return;
      }
      retry();
    };
    requestAnimationFrame(apply);
    return () => {
      cancelled = true;
      release?.();
    };
  }, [state.pages.length]);

  const topBar = isMobile ? (
    <MobileEditorTopBar
      controller={controller}
      hasDocument={state.hasDocument}
      dirty={state.dirty}
    />
  ) : (
    <EditorTopBar
      controller={controller}
      hasDocument={state.hasDocument}
      dirty={state.dirty}
      addTextArmed={state.mode === "addText"}
      onToggleAddText={() =>
        store.setMode(
          store.getState().mode === "addText" ? "select" : "addText",
        )
      }
      findOpen={state.findOpen}
      onToggleFind={() => store.setFindOpen(!store.getState().findOpen)}
      onShowHelp={() => store.setHelpOpen(true)}
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

  // Non-blocking progress pill: pages stay mounted and paint progressively
  // underneath, so entering from the viewer shows the same position settling
  // in rather than a white flash followed by a jump.
  const showLoading = state.loading;
  const p = state.progress;
  const percent =
    p && p.total > 0 ? Math.round((p.current / p.total) * 100) : null;
  const stageLabel =
    p?.stage ?? t("pdfTextEditor.stage.loadingDocument", "Loading document");

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
          <Box
            pos="absolute"
            top={12}
            left="50%"
            style={{
              transform: "translateX(-50%)",
              zIndex: 100,
              pointerEvents: "none",
              borderRadius: 999,
              border: "1px solid var(--mantine-color-default-border)",
              background: "var(--mantine-color-body)",
              boxShadow: "0 3px 14px rgba(0, 0, 0, 0.14)",
              padding: "8px 16px",
              maxWidth: "min(420px, 90%)",
            }}
            data-testid="pdf-editor-stage-loading"
          >
            <Group gap="sm" wrap="nowrap">
              <Loader size="xs" />
              <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                {stageLabel}
              </Text>
              {percent !== null ? (
                <Progress
                  value={percent}
                  w={80}
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
                  w={80}
                  size="sm"
                  data-testid="pdf-editor-load-progress"
                  aria-label={t(
                    "pdfTextEditor.stage.loadingProgress",
                    "Loading progress",
                  )}
                />
              )}
            </Group>
          </Box>
        )}
        <MarqueeSelector store={store} />
        {poster && (
          <Box
            pos="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            data-testid="pdf-editor-poster"
            style={{
              zIndex: 90,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--mantine-color-body)",
              opacity: posterFading ? 0 : 1,
              transition: "opacity 200ms ease",
            }}
          >
            <img
              src={poster.objectUrl}
              alt=""
              draggable={false}
              onError={() => dismissPoster()}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                boxShadow: "0 0 4px rgba(0,0,0,0.2)",
              }}
            />
          </Box>
        )}
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
                      handlePaintedPage(pageIndex);
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
            fitPaddingPx={isMobile ? MOBILE_FIT_PAD_PX : DESKTOP_FIT_PAD_PX}
            compact={isMobile}
          />
        )}
      </Box>
      {isMobile && state.hasDocument && (
        <MobileActionBar
          store={store}
          controller={controller}
          addTextArmed={state.mode === "addText"}
          findOpen={state.findOpen}
        />
      )}
    </Stack>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useEditorState,
  useSharedEditorStore,
} from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import {
  useEditorSelection,
  useFindMatch,
} from "@editor/tools/pdfTextEditor/hooks/useEditorSelection";
import { PageView } from "@editor/tools/pdfTextEditor/components/PageView";
import { pageViewHandlers } from "@editor/tools/pdfTextEditor/util/pageViewHandlers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import type { ViewerPageLayerProps } from "@editor/contexts/viewer/ViewerPageTool";
import { useViewer } from "@editor/contexts/ViewerContext";
import type { PdfRenderMode } from "@editor/services/preferencesService";

/** Display aspect ratios further apart than this mean the two disagree on rotation. */
const ASPECT_TOLERANCE = 0.02;

const NONE: readonly string[] = Object.freeze([]);

/**
 * Replaces a viewer page's layers with the text editor's page while editing.
 * The viewer keeps scrolling, zoom and page virtualisation; the editor draws
 * the page itself, because only its render reflects unsaved edits.
 *
 * The viewer lays a page out unrotated and turns the box by its /Rotate with a
 * CSS transform, while the editor's page is already in display orientation. The
 * editor page is therefore sized to the turned box and turned back, so on
 * screen it is upright and pointer maths needs no rotation.
 */
export function ViewerEditLayer({
  pageIndex,
  width,
  height,
  onCovered,
}: ViewerPageLayerProps) {
  const store = useSharedEditorStore();
  const { pdfRenderMode } = useViewer();
  // Each page watches only its own snapshot, so an edit re-renders one page.
  // A new or closed document replaces every snapshot, so `store.document`
  // below stays current.
  const page = useEditorState(store, (s) => s.pages[pageIndex]);
  const document = store.document;
  const [paintedFor, setPaintedFor] = useState<EditorDocument | null>(null);
  const onPainted = useCallback(() => setPaintedFor(document), [document]);

  const quarterTurns = (page?.display.rotate ?? 0) & 3;
  const sideways = quarterTurns % 2 === 1;
  const displayWidth = sideways ? height : width;
  const displayHeight = sideways ? width : height;
  const fits =
    !!page &&
    Math.abs(displayWidth / displayHeight - page.width / page.height) <=
      ASPECT_TOLERANCE * (page.width / page.height);
  const covered = !!document && fits && paintedFor === document;
  useEffect(() => onCovered(covered), [covered, onCovered]);
  useEffect(() => () => onCovered(false), [onCovered]);

  if (!document || !page || !fits) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: (width - displayWidth) / 2,
        top: (height - displayHeight) / 2,
        width: displayWidth,
        height: displayHeight,
        // Above the viewer's layers while they still show underneath.
        zIndex: 10,
        transform: quarterTurns
          ? `rotate(${-90 * quarterTurns}deg)`
          : undefined,
      }}
      onPointerDown={(e) => {
        // Shift extends a selection and Ctrl/Cmd+Shift starts the marquee;
        // only a plain press on bare page clears.
        if (!e.shiftKey) store.selection.clear();
      }}
    >
      <EditablePage
        store={store}
        document={document}
        page={page}
        scale={displayWidth / page.width}
        renderMode={pdfRenderMode}
        onPainted={onPainted}
      />
    </div>
  );
}

function EditablePage({
  store,
  document,
  page,
  scale,
  renderMode,
  onPainted,
}: {
  store: EditorStore;
  document: EditorDocument;
  page: PageSnapshot;
  scale: number;
  renderMode: PdfRenderMode;
  onPainted: () => void;
}) {
  const widthMode = useEditorState(store, (s) => s.widthMode);
  const showRulers = useEditorState(store, (s) => s.showRulers);
  const selection = useEditorSelection(store);
  const findMatch = useFindMatch(store);

  // PageView is memoised: hand it only this page's share of the selection, in
  // arrays that keep their identity while that share is unchanged, so a click
  // on one page does not re-render every other.
  const runIds = useOwnIds(selection.runIds, page.runs);
  const imageIds = useOwnIds(selection.imageIds, page.images);
  const shapeIds = useOwnIds(selection.shapeIds, page.shapes);
  const ownsMatch = page.runs.some((r) => r.id === findMatch?.runId);
  const ownsFormField = (page.annotations ?? []).some(
    (a) => a.id === selection.formFieldId,
  );
  const handlers = pageViewHandlers(store);

  return (
    <PageView
      document={document}
      store={store}
      page={page}
      scale={scale}
      renderMode={renderMode}
      widthMode={widthMode}
      showRulers={showRulers}
      selectedRunIds={runIds}
      selectedImageIds={imageIds}
      selectedShapeIds={shapeIds}
      findMatch={ownsMatch ? findMatch : null}
      selectedFormFieldId={ownsFormField ? selection.formFieldId : null}
      selectedTextRange={
        runIds.length === 1 && selection.runIds.length === 1
          ? selection.textRange
          : null
      }
      {...handlers}
      // A failed render leaves the viewer's own page showing.
      onFirstPainted={onPainted}
    />
  );
}

function useOwnIds(
  selected: readonly string[],
  own: readonly { id: string }[],
): string[] {
  const key = selected.filter((id) => own.some((o) => o.id === id)).join("\n");
  return useMemo(() => (key ? key.split("\n") : (NONE as string[])), [key]);
}

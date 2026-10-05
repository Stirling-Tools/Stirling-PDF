import { useEffect, useState } from "react";
import { useEditorStoreView } from "@app/tools/pdfTextEditor/hooks/useEditorStore";
import { usePageViewHandlers } from "@app/tools/pdfTextEditor/hooks/usePageViewHandlers";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import { PageView } from "@app/tools/pdfTextEditor/components/PageView";

interface ViewerEditLayerProps {
  /** Workbench file the viewer page belongs to. */
  fileId: string | null | undefined;
  pageIndex: number;
  /** CSS width the viewer lays the page out at; the editor matches its scale. */
  width: number;
}

/**
 * The text editor's page, hosted on top of a viewer page. The viewer keeps
 * scrolling, zoom and virtualisation; this adds the editable overlays and the
 * editor's own bitmap, which is the only render that reflects unsaved edits.
 * Renders nothing until the editor holds the same file the viewer shows.
 */
export default function ViewerEditLayer({
  fileId,
  pageIndex,
  width,
}: ViewerEditLayerProps) {
  const { store, state } = useEditorStoreView();
  const session = useEditorSession();
  const handlers = usePageViewHandlers(store);
  const [selection, setSelection] = useState(store.selection.value);
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(
    store.selection.highlight.get(),
  );
  useEffect(() => store.selection.subscribe(setSelection), [store]);
  useEffect(
    () => store.selection.highlight.subscribe(setHighlightedRunId),
    [store],
  );

  const page = state.pages[pageIndex];
  const doc = store.document;
  if (!doc || !page || !fileId || session?.fileId !== fileId) return null;

  return (
    <PageView
      embedded
      document={doc}
      page={page}
      scale={width / page.width}
      widthMode={state.widthMode}
      showRulers={state.showRulers}
      selectedRunIds={selection.runIds}
      selectedImageIds={selection.imageIds}
      highlightedRunId={highlightedRunId}
      {...handlers}
      onPagePointerDown={(e) => {
        if (!e.shiftKey) store.selection.clear();
      }}
    />
  );
}

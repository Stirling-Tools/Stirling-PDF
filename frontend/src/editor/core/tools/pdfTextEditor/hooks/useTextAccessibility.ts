import { useCallback, useMemo } from "react";
import { RetagTextCommand } from "@editor/tools/pdfTextEditor/commands/RetagTextCommand";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

/**
 * The tag of the selected text (null unless exactly one run and nothing else
 * is selected), and a way to retag it.
 */
export function useTextAccessibility(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
) {
  // One memo over the pages: a retag changes no snapshot of the run, only
  // republishes them.
  const { run, tag } = useMemo(() => {
    const doc = store.document;
    const selected =
      selection.runIds.length === 1 &&
      selection.imageIds.length === 0 &&
      selection.shapeIds.length === 0
        ? (state.pages
            .flatMap((page) => page.runs)
            .find((r) => r.id === selection.runIds[0]) ?? null)
        : null;
    return {
      run: selected,
      tag: doc && selected ? textTag(doc, selected) : null,
    };
  }, [store, state.pages, selection]);

  const retag = useCallback(
    (type: StructureType) => {
      if (run?.mcid === undefined || tag?.kind !== "tagged") return;
      store.dispatch(
        new RetagTextCommand({
          pageIndex: run.pageIndex,
          mcid: run.mcid,
          type,
        }),
      );
    },
    [store, run, tag],
  );

  return { tag, retag };
}

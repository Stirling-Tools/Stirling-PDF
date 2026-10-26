import { useCallback, useMemo } from "react";
import { RetagTextCommand } from "@editor/tools/pdfTextEditor/commands/RetagTextCommand";
import { TagTextCommand } from "@editor/tools/pdfTextEditor/commands/TagTextCommand";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

/**
 * The tag of the selected text (null unless exactly one run and nothing else
 * is selected), and a way to change it.
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

  /** Retags the text's block, or gives untagged text an element of its own. */
  const setTag = useCallback(
    (type: StructureType) => {
      if (!run || !tag) return;
      if (tag.kind === "tagged" && run.mcid !== undefined) {
        store.dispatch(
          new RetagTextCommand({
            pageIndex: run.pageIndex,
            mcid: run.mcid,
            type,
          }),
        );
      } else if (tag.kind === "untagged" && tag.taggable) {
        store.dispatch(
          new TagTextCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            as: type,
          }),
        );
      }
    },
    [store, run, tag],
  );

  return { tag, setTag };
}

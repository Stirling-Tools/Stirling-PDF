import { useCallback, useMemo } from "react";
import { SetAltTextCommand } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import {
  imageAccessibility,
  type ImageAccessibility,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/** The accessibility of the selected image; null unless exactly one image and nothing else is selected. */
export function useImageAccessibility(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
) {
  const accessibility = useMemo((): ImageAccessibility | null => {
    const doc = store.document;
    if (
      !doc ||
      selection.imageIds.length !== 1 ||
      selection.runIds.length > 0 ||
      selection.shapeIds.length > 0
    )
      return null;
    const image = state.pages
      .flatMap((page) => page.images)
      .find((img) => img.id === selection.imageIds[0]);
    return image ? imageAccessibility(doc, image) : null;
  }, [store, state.pages, selection]);

  const setDescription = useCallback(
    (text: string) => {
      if (accessibility?.kind !== "describable") return;
      store.dispatch(
        new SetAltTextCommand({
          pageIndex: accessibility.pageIndex,
          mcid: accessibility.mcid,
          // An emptied field removes the description rather than saving an empty one.
          alt: text === "" ? null : text,
        }),
      );
    },
    [store, accessibility],
  );

  return { accessibility, setDescription };
}

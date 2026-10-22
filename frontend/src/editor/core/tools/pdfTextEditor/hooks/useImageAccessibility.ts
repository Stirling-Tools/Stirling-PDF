import { useCallback, useMemo } from "react";
import { SetAltTextCommand } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import { ensureAllPagesRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import {
  imageAccessibility,
  nextImageNeedingAttention,
  reviewImages,
  type ImageAccessibility,
  type ImageReview,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/**
 * The accessibility of the selected image (null unless exactly one image and
 * nothing else is selected), and the review of images needing attention.
 * `review` covers only pages read so far.
 */
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

  const review = useMemo(
    (): ImageReview =>
      store.document
        ? reviewImages(store.document, state.pages)
        : { needsDescription: 0, untagged: 0 },
    [store, state.pages],
  );

  const selectNextImage = useCallback(() => {
    // An image on a page not yet scrolled to would otherwise be skipped.
    ensureAllPagesRead(store);
    const doc = store.document;
    if (!doc) return;
    const next = nextImageNeedingAttention(
      doc,
      store.getState().pages,
      store.selection.value.imageIds[0] ?? null,
    );
    if (!next) return;
    store.selection.selectImage(next.id);
    // A page read just now has no overlay until React commits it.
    window.requestAnimationFrame(() =>
      document
        .querySelector(`[data-testid="pdf-editor-image-${next.id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, [store]);

  return { accessibility, setDescription, review, selectNextImage };
}

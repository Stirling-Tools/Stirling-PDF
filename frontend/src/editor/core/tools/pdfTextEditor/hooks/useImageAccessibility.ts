import { useCallback, useMemo } from "react";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { SetAltTextCommand } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import { SetDecorativeCommand } from "@editor/tools/pdfTextEditor/commands/SetDecorativeCommand";
import { TagImageCommand } from "@editor/tools/pdfTextEditor/commands/TagImageCommand";
import { ensureAllPagesRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  ImageObjectSnapshot,
  SelectionState,
} from "@editor/tools/pdfTextEditor/types";
import {
  imageAccessibility,
  nextImageNeedingAttention,
  retaggableTag,
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
  const image = useMemo((): ImageObjectSnapshot | null => {
    if (
      selection.imageIds.length !== 1 ||
      selection.runIds.length > 0 ||
      selection.shapeIds.length > 0
    )
      return null;
    return (
      state.pages
        .flatMap((page) => page.images)
        .find((img) => img.id === selection.imageIds[0]) ?? null
    );
  }, [state.pages, selection]);

  const accessibility = useMemo((): ImageAccessibility | null => {
    const doc = store.document;
    return doc && image ? imageAccessibility(doc, image) : null;
  }, [store, image]);

  const setDescription = useCallback(
    (text: string) => {
      if (!image || accessibility?.kind !== "describable") return;
      // An emptied field removes the description rather than saving an empty one.
      const command = describeCommand(image, text === "" ? null : text);
      if (command) store.dispatch(command);
    },
    [store, image, accessibility],
  );

  const setDecorative = useCallback(
    (decorative: boolean) => {
      const doc = store.document;
      if (!doc || !image) return;
      const command = decorativeCommand(doc, image, decorative);
      if (command) store.dispatch(command);
    },
    [store, image],
  );

  const review = useMemo(
    (): ImageReview =>
      store.document
        ? reviewImages(store.document, state.pages)
        : { needsDescription: 0, untagged: 0, untaggable: 0 },
    [store, state.pages],
  );

  /** False when no image needs attention, leaving the selection alone. */
  const selectNextImage = useCallback((): boolean => {
    // An image on a page not yet scrolled to would otherwise be skipped.
    ensureAllPagesRead(store);
    const doc = store.document;
    if (!doc) return false;
    const next = nextImageNeedingAttention(
      doc,
      store.getState().pages,
      store.selection.value.imageIds[0] ?? null,
    );
    if (!next) return false;
    store.selection.selectImage(next.id);
    // A page read just now has no overlay until React commits it.
    window.requestAnimationFrame(() =>
      document
        .querySelector(`[data-testid="pdf-editor-image-${next.id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
    return true;
  }, [store]);

  return {
    accessibility,
    setDescription,
    setDecorative,
    review,
    selectNextImage,
  };
}

function describeCommand(
  image: ImageObjectSnapshot,
  alt: string | null,
): Command | null {
  if (image.mcid !== undefined) {
    return new SetAltTextCommand({
      pageIndex: image.pageIndex,
      mcid: image.mcid,
      alt,
    });
  }
  // Clearing the field of an image no element owns leaves it untagged.
  if (alt === null) return null;
  return new TagImageCommand({
    pageIndex: image.pageIndex,
    imageId: image.id,
    as: "figure",
    alt,
  });
}

/**
 * Content the file's elements own changes through its element; anything
 * else is retagged.
 */
function decorativeCommand(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
  decorative: boolean,
): Command | null {
  if (retaggableTag(doc, image)) {
    return new TagImageCommand({
      pageIndex: image.pageIndex,
      imageId: image.id,
      as: decorative ? "artifact" : "figure",
    });
  }
  if (image.mcid === undefined) return null;
  return new SetDecorativeCommand({
    pageIndex: image.pageIndex,
    mcid: image.mcid,
    decorative,
  });
}
